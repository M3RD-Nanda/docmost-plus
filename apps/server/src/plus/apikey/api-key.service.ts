import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { JwtApiKeyPayload } from '../../core/auth/dto/jwt-payload';
import { TokenService } from '../../core/auth/services/token.service';
import { isUserDisabled } from '../../common/helpers';

type ApiKeyRow = {
  id: string;
  name: string | null;
  creator_id?: string;
  workspace_id?: string;
  expires_at?: Date | string | null;
  expiresAt?: Date | string | null;
  last_used_at?: Date | string | null;
  lastUsedAt?: Date | string | null;
  created_at?: Date | string;
  createdAt?: Date | string;
  deleted_at?: Date | string | null;
  deletedAt?: Date | string | null;
  [key: string]: unknown;
};

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly moduleRef: ModuleRef,
  ) {}

  private get tokenService(): TokenService {
    return this.moduleRef.get(TokenService, { strict: false });
  }

  /** Kontrak slot EE di jwt.strategy.ts — wajib `{ user, workspace }`. */
  async validateApiKey(
    payload: JwtApiKeyPayload,
  ): Promise<{ user: User; workspace: Workspace }> {
    const row = (await this.table()
      .selectFrom('api_keys')
      .selectAll()
      .where('id', '=', payload.apiKeyId)
      .where('workspace_id', '=', payload.workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()) as ApiKeyRow | undefined;

    if (!row) throw new UnauthorizedException('API key tidak dikenal');

    // CamelCasePlugin: kolom kembali sebagai camelCase.
    const expiresAt = row.expires_at ?? row.expiresAt ?? null;
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      throw new UnauthorizedException('API key sudah kedaluwarsa');
    }

    const user = await this.userRepo.findById(payload.sub, payload.workspaceId);
    if (!user || isUserDisabled(user)) throw new UnauthorizedException();

    const workspace = await this.workspaceRepo.findById(payload.workspaceId);
    if (!workspace) throw new UnauthorizedException();

    // Jejak pemakaian; kegagalan update tidak boleh menggagalkan request.
    void this.table()
      .updateTable('api_keys')
      .set({ last_used_at: new Date() } as never)
      .where('id', '=', row.id)
      .execute()
      .catch(() => undefined);

    return { user, workspace };
  }

  async create(
    user: User,
    workspaceId: string,
    dto: { name: string; expiresInDays?: number },
  ) {
    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 86_400_000)
      : null;

    const inserted = (await this.table()
      .insertInto('api_keys')
      .values({
        name: dto.name,
        creator_id: user.id,
        workspace_id: workspaceId,
        expires_at: expiresAt,
      } as never)
      .returning(['id', 'name', 'expires_at', 'created_at'])
      .executeTakeFirst()) as ApiKeyRow;

    const token = await this.tokenService.generateApiToken({
      apiKeyId: inserted.id,
      user,
      workspaceId,
      ...(expiresAt
        ? { expiresIn: Math.floor((expiresAt.getTime() - Date.now()) / 1000) }
        : {}),
    });

    // Token hanya ditampilkan sekali di sini; server tidak menyimpan salinannya.
    return {
      id: inserted.id,
      name: inserted.name,
      token,
      expiresAt: inserted.expires_at,
      createdAt: inserted.created_at,
    };
  }

  async list(user: User, workspaceId: string) {
    return this.table()
      .selectFrom('api_keys')
      .select(['id', 'name', 'last_used_at', 'expires_at', 'created_at'])
      .where('creator_id', '=', user.id)
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .orderBy('created_at', 'desc')
      .execute();
  }

  async revoke(user: User, workspaceId: string, id: string) {
    const result = await this.table()
      .updateTable('api_keys')
      .set({ deleted_at: new Date() } as never)
      .where('id', '=', id)
      .where('creator_id', '=', user.id)
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    if (!Number(result?.numUpdatedRows ?? 0)) {
      throw new NotFoundException('API key tidak ditemukan');
    }
    return { revoked: true };
  }

  // ponytail: cast `any` karena tipe DB upstream belum memuat tabel api_keys.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private table(): any {
    return this.db as unknown as { selectFrom: (t: string) => any; insertInto: (t: string) => any; updateTable: (t: string) => any };
  }
}
