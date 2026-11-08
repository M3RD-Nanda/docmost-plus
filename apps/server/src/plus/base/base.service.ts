import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { sql } from 'kysely';

const ALLOWED_TYPES = [
  'text',
  'number',
  'select',
  'multi_select',
  'date',
  'checkbox',
  'formula',
] as const;

type PropertyType = (typeof ALLOWED_TYPES)[number];

/** JSONB cell reader yang dipakai untuk sort/filter. */
function cellExpr(propId: string) {
  return sql`cells ->> ${propId}`;
}

/**
 * Bases (mini-database) untuk halaman `is_base = true`.
 *
 * Memakai tabel yang sudah ada: base_properties, base_rows, base_views.
 * ponytail: posisi baris/properti memakai timestamp string (bukan fractional
 * index) — cukup untuk tambah-di-akhir; ganti bila butuh reorder drag-drop.
 */
@Injectable()
export class BaseService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageAccess: PageAccessService,
    private readonly pagePermissionRepo: PagePermissionRepo,
  ) {}

  private async assertPage(pageId: string, workspace: Workspace, user: User, edit = false) {
    const page = await this.db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', pageId)
      .where('workspaceId', '=', workspace.id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!page) throw new NotFoundException('Halaman tidak ditemukan');
    const pageRef = page as unknown as Parameters<PageAccessService['validateCanView']>[0];
    if (edit) {
      await this.pageAccess.validateCanEdit(pageRef, user);
    } else {
      await this.pageAccess.validateCanView(pageRef, user);
    }
    return page;
  }

  private position(): string {
    // 13 digit supaya urutan leksikografis == urutan waktu
    return String(Date.now()).padStart(14, '0');
  }

  async schema(pageId: string, workspace: Workspace, user: User) {
    const page = await this.assertPage(pageId, workspace, user);
    const properties = await this.db
      .selectFrom('baseProperties')
      .selectAll()
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .orderBy('position', 'asc')
      .execute();
    const views = await this.db
      .selectFrom('baseViews')
      .selectAll()
      .where('pageId', '=', pageId)
      .orderBy('position', 'asc')
      .execute();

    return { page, properties, views };
  }

  async addProperty(
    pageId: string,
    workspace: Workspace,
    user: User,
    dto: { id?: string; name: string; type: PropertyType; typeOptions?: unknown },
  ) {
    await this.assertPage(pageId, workspace, user, true);
    if (!ALLOWED_TYPES.includes(dto.type)) {
      throw new BadRequestException(`Tipe tidak didukung: ${dto.type}`);
    }
    const id = (dto.id || `st_${Math.random().toString(36).slice(2, 10)}`).trim();
    if (!/^[a-zA-Z0-9_]{2,40}$/.test(id)) {
      throw new BadRequestException('id properti hanya huruf, angka, underscore (2–40)');
    }

    const exists = await this.db
      .selectFrom('baseProperties')
      .select('id')
      .where('pageId', '=', pageId)
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (exists) throw new BadRequestException('id properti sudah dipakai');

    await this.db
      .insertInto('baseProperties')
      .values({
        id,
        pageId,
        name: dto.name.trim(),
        type: dto.type,
        position: this.position(),
        typeOptions: (dto.typeOptions ?? null) as never,
        workspaceId: workspace.id,
      })
      .execute();

    return { id };
  }

  async updateProperty(
    pageId: string,
    propertyId: string,
    workspace: Workspace,
    user: User,
    dto: { name?: string; typeOptions?: unknown },
  ) {
    await this.assertPage(pageId, workspace, user, true);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.typeOptions !== undefined) patch.typeOptions = dto.typeOptions;

    const res = await this.db
      .updateTable('baseProperties')
      .set(patch as never)
      .where('pageId', '=', pageId)
      .where('id', '=', propertyId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!Number(res?.numUpdatedRows ?? 0)) throw new NotFoundException('Properti tidak ditemukan');
    return { updated: true };
  }

  async removeProperty(pageId: string, propertyId: string, workspace: Workspace, user: User) {
    await this.assertPage(pageId, workspace, user, true);
    const res = await this.db
      .updateTable('baseProperties')
      .set({ deletedAt: new Date() } as never)
      .where('pageId', '=', pageId)
      .where('id', '=', propertyId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!Number(res?.numUpdatedRows ?? 0)) throw new NotFoundException('Properti tidak ditemukan');
    return { deleted: true };
  }

  async rows(
    pageId: string,
    workspace: Workspace,
    user: User,
    opts: { limit?: number; cursor?: string; sort?: string; dir?: 'asc' | 'desc'; type?: string },
  ) {
    await this.assertPage(pageId, workspace, user);

    const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
    let q = this.db
      .selectFrom('baseRows')
      .select(['id', 'cells', 'position', 'createdAt', 'updatedAt'])
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .limit(limit);

    if (opts.sort) {
      const dir = opts.dir === 'desc' ? 'desc' : 'asc';
      const cast =
        opts.type === 'number'
          ? sql`NULLIF(${cellExpr(opts.sort)}, '')::numeric`
          : opts.type === 'date'
            ? sql`NULLIF(${cellExpr(opts.sort)}, '')::timestamptz`
            : cellExpr(opts.sort);
      q = q.orderBy(cast, dir).orderBy('id', 'asc');
    } else {
      q = q.orderBy('position', 'asc').orderBy('id', 'asc');
    }

    if (opts.cursor) q = q.where('position', '>', opts.cursor);

    const items = await q.execute();
    return { items, nextCursor: items.length === limit ? items[items.length - 1]?.position : null };
  }

  async addRow(
    pageId: string,
    workspace: Workspace,
    user: User,
    dto: { cells?: Record<string, unknown> },
  ) {
    await this.assertPage(pageId, workspace, user, true);
    const inserted = await this.db
      .insertInto('baseRows')
      .values({
        pageId,
        cells: (dto.cells ?? {}) as never,
        position: this.position(),
        creatorId: user.id,
        workspaceId: workspace.id,
      })
      .returning(['id', 'cells', 'position'])
      .executeTakeFirst();
    return inserted;
  }

  async updateRow(
    pageId: string,
    rowId: string,
    workspace: Workspace,
    user: User,
    dto: { cells: Record<string, unknown> },
  ) {
    await this.assertPage(pageId, workspace, user, true);
    if (!dto.cells || typeof dto.cells !== 'object') {
      throw new BadRequestException('cells wajib objek');
    }
    const res = await this.db
      .updateTable('baseRows')
      .set({ cells: dto.cells as never, updatedAt: new Date(), lastUpdatedById: user.id } as never)
      .where('pageId', '=', pageId)
      .where('id', '=', rowId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!Number(res?.numUpdatedRows ?? 0)) throw new NotFoundException('Baris tidak ditemukan');
    return { updated: true };
  }

  async removeRow(pageId: string, rowId: string, workspace: Workspace, user: User) {
    await this.assertPage(pageId, workspace, user, true);
    const res = await this.db
      .updateTable('baseRows')
      .set({ deletedAt: new Date() } as never)
      .where('pageId', '=', pageId)
      .where('id', '=', rowId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!Number(res?.numUpdatedRows ?? 0)) throw new NotFoundException('Baris tidak ditemukan');
    return { deleted: true };
  }

  async addView(
    pageId: string,
    workspace: Workspace,
    user: User,
    dto: { name: string; type?: 'table' | 'kanban' | 'list'; config?: unknown },
  ) {
    await this.assertPage(pageId, workspace, user, true);
    const inserted = await this.db
      .insertInto('baseViews')
      .values({
        pageId,
        name: dto.name.trim(),
        type: dto.type ?? 'table',
        position: this.position(),
        config: (dto.config ?? {}) as never,
        workspaceId: workspace.id,
        creatorId: user.id,
      })
      .returning(['id', 'name', 'type'])
      .executeTakeFirst();
    return inserted;
  }

  async updateView(
    pageId: string,
    viewId: string,
    workspace: Workspace,
    user: User,
    dto: { name?: string; type?: string; config?: unknown },
  ) {
    await this.assertPage(pageId, workspace, user, true);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.type !== undefined) patch.type = dto.type;
    if (dto.config !== undefined) patch.config = dto.config;

    const res = await this.db
      .updateTable('baseViews')
      .set(patch as never)
      .where('pageId', '=', pageId)
      .where('id', '=', viewId)
      .executeTakeFirst();
    if (!Number(res?.numUpdatedRows ?? 0)) throw new NotFoundException('View tidak ditemukan');
    return { updated: true };
  }

  /** Tandai halaman biasa menjadi Bases (atau sebaliknya). */
  async setBase(pageId: string, workspace: Workspace, user: User, isBase: boolean) {
    await this.assertPage(pageId, workspace, user, true);
    await this.db
      .updateTable('pages')
      .set({ isBase } as never)
      .where('id', '=', pageId)
      .where('workspaceId', '=', workspace.id)
      .execute();

    // View default supaya UI langsung punya tempat menyimpan konfigurasi kolom.
    if (isBase) {
      const existing = await this.db
        .selectFrom('baseViews')
        .select('id')
        .where('pageId', '=', pageId)
        .executeTakeFirst();
      if (!existing) {
        await this.db
          .insertInto('baseViews')
          .values({
            pageId,
            name: 'Tabel',
            type: 'table',
            position: this.position(),
            config: {} as never,
            workspaceId: workspace.id,
            creatorId: user.id,
          })
          .execute();
      }
    }

    return { isBase };
  }

  /** Daftar halaman Bases yang bisa diakses user. */
  async listBasePages(workspace: Workspace, user: User) {
    const rows = await this.db
      .selectFrom('pages')
      .select(['id', 'title', 'slugId', 'spaceId', 'updatedAt'])
      .where('workspaceId', '=', workspace.id)
      .where('isBase', '=', true)
      .where('deletedAt', 'is', null)
      .orderBy('updatedAt', 'desc')
      .limit(100)
      .execute();

    if (!rows.length) return [];

    const accessible = await this.pagePermissionRepo.filterAccessiblePageIds({
      pageIds: rows.map((r) => r.id),
      userId: user.id,
      spaceId: null,
    });
    const allowed = new Set(accessible);
    return rows.filter((r) => allowed.has(r.id));
  }
}
