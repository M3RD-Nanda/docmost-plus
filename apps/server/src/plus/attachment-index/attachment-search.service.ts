import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';

/**
 * Pencarian isi lampiran (PDF/DOCX/teks).
 *
 * Catatan: `core/search/search.service.ts` TIDAK mencari ke tabel attachments —
 * ia hanya memakai `pages.text_content`. Jadi endpoint ini yang menyediakan
 * pencarian lampiran, dengan filter hak akses halaman induk memakai repo
 * permission yang sama dengan fitur lain (label/favorite).
 */
@Injectable()
export class AttachmentSearchService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pagePermissionRepo: PagePermissionRepo,
  ) {}

  async search(
    user: User,
    workspace: Workspace,
    query: string,
    limit = 20,
  ) {
    const q = (query ?? '').trim();
    if (q.length < 2) return { items: [] };

    const rows = await this.db
      .selectFrom('attachments')
      .select([
        'id',
        'fileName',
        'fileExt',
        'pageId',
        'spaceId',
        'createdAt',
        sql<string>`ts_headline('simple', substring(text_content, 1, 20000), plainto_tsquery('simple', ${q}), 'MinWords=6, MaxWords=12, MaxFragments=2')`.as(
          'snippet',
        ),
        sql<number>`ts_rank(tsv, plainto_tsquery('simple', ${q}))`.as('rank'),
      ])
      .where('workspaceId', '=', workspace.id)
      .where('deletedAt', 'is', null)
      .where(sql<boolean>`tsv @@ plainto_tsquery('simple', ${q})`)
      .orderBy(sql`ts_rank(tsv, plainto_tsquery('simple', ${q}))`, 'desc')
      .limit(limit * 2)
      .execute();

    if (!rows.length) return { items: [] };

    const pageIds = [...new Set(rows.map((r) => r.pageId).filter(Boolean))] as string[];
    const accessible = pageIds.length
      ? await this.pagePermissionRepo.filterAccessiblePageIds({
          pageIds,
          userId: user.id,
          spaceId: null,
        })
      : [];
    const allowed = new Set(accessible);

    return {
      items: rows
        .filter((r) => !r.pageId || allowed.has(r.pageId))
        .slice(0, limit)
        .map((r) => ({
          attachmentId: r.id,
          fileName: r.fileName,
          fileExt: r.fileExt,
          pageId: r.pageId,
          spaceId: r.spaceId,
          snippet: r.snippet,
          rank: r.rank,
        })),
    };
  }
}
