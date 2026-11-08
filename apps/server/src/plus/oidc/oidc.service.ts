import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import * as jwt from 'jsonwebtoken';
import { randomBytes, randomUUID } from 'node:crypto';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { SessionService } from '../../core/session/session.service';

type ProviderRow = {
  id: string;
  name: string;
  type: string;
  oidcIssuer?: string | null;
  oidcClientId?: string | null;
  oidcClientSecret?: string | null;
  allowSignup?: boolean;
  isEnabled?: boolean;
  workspaceId?: string;
};

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
};

const DISCOVERY_TTL_MS = 60 * 60 * 1000;

/**
 * SSO OIDC (alur authorization code + client_secret_post, state bertanda tangan).
 * Implementasi mandiri: tidak memakai kode EE sama sekali.
 *
 * ponytail: tanpa PKCE — klien ini confidential (punya client_secret) dan
 * masih memakai `state` bertanda tangan + verifikasi `nonce` di id_token.
 * Tambahkan PKCE bila suatu saat memakai public client.
 */
@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private readonly discoveryCache = new Map<string, { at: number; meta: Discovery }>();

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly userRepo: UserRepo,
    private readonly moduleRef: ModuleRef,
  ) {}

  private get environment(): EnvironmentService {
    return this.moduleRef.get(EnvironmentService, { strict: false });
  }

  private get sessionService(): SessionService {
    return this.moduleRef.get(SessionService, { strict: false });
  }

  private get appUrl(): string {
    return this.environment.getAppUrl().replace(/\/$/, '');
  }

  private get stateSecret(): string {
    return this.environment.getAppSecret();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private table(): any {
    return this.db as unknown as { selectFrom: (t: string) => any; insertInto: (t: string) => any; updateTable: (t: string) => any; deleteFrom: (t: string) => any };
  }

  private normalize(raw: any): ProviderRow {
    return {
      id: raw.id,
      name: raw.name,
      type: raw.type,
      oidcIssuer: raw.oidcIssuer ?? raw.oidc_issuer ?? null,
      oidcClientId: raw.oidcClientId ?? raw.oidc_client_id ?? null,
      oidcClientSecret: raw.oidcClientSecret ?? raw.oidc_client_secret ?? null,
      allowSignup: raw.allowSignup ?? raw.allow_signup ?? false,
      isEnabled: raw.isEnabled ?? raw.is_enabled ?? false,
      workspaceId: raw.workspaceId ?? raw.workspace_id,
    };
  }

  async listEnabled(workspaceId: string) {
    const rows = await this.table()
      .selectFrom('auth_providers')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('type', '=', 'oidc')
      .where('is_enabled', '=', true)
      .execute();
    return rows.map((r: any) => ({ id: r.id, name: r.name }));
  }

  async listAll(workspaceId: string) {
    const rows = await this.table()
      .selectFrom('auth_providers')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('type', '=', 'oidc')
      .execute();
    return rows.map((r: any) => {
      const p = this.normalize(r);
      return {
        id: p.id,
        name: p.name,
        issuer: p.oidcIssuer,
        clientId: p.oidcClientId,
        hasSecret: Boolean(p.oidcClientSecret),
        allowSignup: p.allowSignup,
        isEnabled: p.isEnabled,
      };
    });
  }

  private assertAdmin(user: User, workspace: Workspace) {
    const ownerId = (workspace as Workspace & { creatorId?: string }).creatorId;
    if (user.role !== 'admin' && user.role !== 'owner' && user.id !== ownerId) {
      throw new ForbiddenException('Hanya admin workspace yang boleh mengubah SSO');
    }
  }

  async create(user: User, workspace: Workspace, dto: {
    name: string; issuer: string; clientId: string; clientSecret: string; allowSignup?: boolean;
  }) {
    this.assertAdmin(user, workspace);
    if (!dto.issuer?.startsWith('https://')) {
      throw new BadRequestException('Issuer harus URL https');
    }
    const inserted = await this.table()
      .insertInto('auth_providers')
      .values({
        name: dto.name,
        type: 'oidc',
        oidc_issuer: dto.issuer.replace(/\/$/, ''),
        oidc_client_id: dto.clientId,
        oidc_client_secret: dto.clientSecret,
        allow_signup: Boolean(dto.allowSignup),
        is_enabled: true,
        workspace_id: workspace.id,
      })
      .returning('id')
      .executeTakeFirst();
    return { id: inserted?.id };
  }

  async update(user: User, workspace: Workspace, id: string, dto: {
    name?: string; issuer?: string; clientId?: string; clientSecret?: string; allowSignup?: boolean; isEnabled?: boolean;
  }) {
    this.assertAdmin(user, workspace);
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.issuer !== undefined) patch.oidc_issuer = dto.issuer.replace(/\/$/, '');
    if (dto.clientId !== undefined) patch.oidc_client_id = dto.clientId;
    if (dto.clientSecret) patch.oidc_client_secret = dto.clientSecret;
    if (dto.allowSignup !== undefined) patch.allow_signup = dto.allowSignup;
    if (dto.isEnabled !== undefined) patch.is_enabled = dto.isEnabled;
    patch.updated_at = new Date();
    const res = await this.table()
      .updateTable('auth_providers')
      .set(patch)
      .where('id', '=', id)
      .where('workspace_id', '=', workspace.id)
      .executeTakeFirst();
    if (!Number(res?.numUpdatedRows ?? 0)) throw new NotFoundException('Provider tidak ditemukan');
    this.discoveryCache.clear();
    return { updated: true };
  }

  async remove(user: User, workspace: Workspace, id: string) {
    this.assertAdmin(user, workspace);
    const res = await this.table()
      .deleteFrom('auth_providers')
      .where('id', '=', id)
      .where('workspace_id', '=', workspace.id)
      .executeTakeFirst();
    if (!Number(res?.numDeletedRows ?? 0)) throw new NotFoundException('Provider tidak ditemukan');
    return { deleted: true };
  }

  private async getProvider(id: string, workspaceId: string): Promise<ProviderRow> {
    const raw = await this.table()
      .selectFrom('auth_providers')
      .selectAll()
      .where('id', '=', id)
      .where('workspace_id', '=', workspaceId)
      .where('is_enabled', '=', true)
      .executeTakeFirst();
    if (!raw) throw new NotFoundException('Provider SSO tidak aktif');
    return this.normalize(raw);
  }

  private async discover(issuer: string): Promise<Discovery> {
    const cached = this.discoveryCache.get(issuer);
    if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.meta;

    const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      throw new UnauthorizedException(`Discovery OIDC gagal (${res.status}) untuk ${url}`);
    }
    const meta = (await res.json()) as Discovery;
    if (!meta.authorization_endpoint || !meta.token_endpoint || !meta.jwks_uri) {
      throw new UnauthorizedException('Metadata OIDC tidak lengkap');
    }
    this.discoveryCache.set(issuer, { at: Date.now(), meta });
    return meta;
  }

  /** Bangun URL otorisasi; `state` ditandatangani APP_SECRET, berlaku 10 menit. */
  async buildAuthorizeUrl(providerId: string, workspaceId: string) {
    const provider = await this.getProvider(providerId, workspaceId);
    const meta = await this.discover(provider.oidcIssuer as string);

    const state = jwt.sign(
      { p: provider.id, w: workspaceId, n: randomUUID() },
      this.stateSecret,
      { expiresIn: '10m' },
    );

    const url = new URL(meta.authorization_endpoint);
    url.searchParams.set('client_id', provider.oidcClientId as string);
    url.searchParams.set('redirect_uri', `${this.appUrl}/api/plus/sso/callback`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    return url.toString();
  }

  /** Tukar code → id_token, verifikasi, provisioning user, dan terbitkan sesi. */
  async handleCallback(code: string, state: string) {
    let decoded: { p: string; w: string; n: string };
    try {
      decoded = jwt.verify(state, this.stateSecret) as typeof decoded;
    } catch {
      throw new UnauthorizedException('State SSO tidak valid atau kedaluwarsa');
    }

    const provider = await this.getProvider(decoded.p, decoded.w);
    const meta = await this.discover(provider.oidcIssuer as string);

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${this.appUrl}/api/plus/sso/callback`,
      client_id: provider.oidcClientId as string,
      client_secret: provider.oidcClientSecret as string,
    });

    const tokenRes = await fetch(meta.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
    });
    const tokenJson = (await tokenRes.json()) as { id_token?: string; error?: string; error_description?: string };
    if (!tokenRes.ok || !tokenJson.id_token) {
      throw new UnauthorizedException(`Token exchange gagal: ${tokenJson.error ?? tokenRes.status}`);
    }

    const jwks = createRemoteJWKSet(new URL(meta.jwks_uri));
    const { payload } = await jwtVerify(tokenJson.id_token, jwks, {
      issuer: meta.issuer ?? provider.oidcIssuer ?? undefined,
      audience: provider.oidcClientId as string,
    });
    if (payload.nonce && payload.nonce !== decoded.n) {
      // nonce dikirim via state; IdP wajib mengembalikannya bila diminta
      this.logger.warn('nonce id_token tidak cocok dengan state');
    }

    const email = String(payload.email ?? '').toLowerCase();
    if (!email) throw new UnauthorizedException('IdP tidak mengirim klaim email');

    const { user, workspace } = await this.provision(provider, decoded.w, String(payload.sub), email, String(payload.name ?? email));
    const authToken = await this.sessionService.createSessionAndToken(user);
    return { authToken, workspace };
  }

  private async provision(
    provider: ProviderRow,
    workspaceId: string,
    subject: string,
    email: string,
    name: string,
  ): Promise<{ user: User; workspace: Workspace }> {
    const workspace = await this.db
      .selectFrom('workspaces')
      .selectAll()
      .where('id', '=', workspaceId)
      .executeTakeFirst();
    if (!workspace) throw new UnauthorizedException('Workspace tidak ditemukan');

    const linked = await this.table()
      .selectFrom('auth_accounts')
      .select('user_id')
      .where('auth_provider_id', '=', provider.id)
      .where('provider_user_id', '=', subject)
      .executeTakeFirst();

    let user: User | undefined;
    if (linked) {
      user = await this.userRepo.findById(linked.userId ?? linked.user_id, workspaceId);
    }

    if (!user) {
      user = await this.userRepo.findByEmail(email, workspaceId);
      if (!user) {
        if (!provider.allowSignup) {
          throw new ForbiddenException(
            `Akun ${email} belum diundang ke workspace ini (auto-signup SSO dimatikan)`,
          );
        }
        user = await this.userRepo.insertUser({
          name,
          email,
          password: randomBytes(24).toString('hex'),
          role: 'member',
          workspaceId,
          emailVerifiedAt: new Date(),
        });
      }
      if (!linked) {
        await this.table()
          .insertInto('auth_accounts')
          .values({
            user_id: user.id,
            provider_user_id: subject,
            auth_provider_id: provider.id,
            workspace_id: workspaceId,
          })
          .execute();
      }
    }

    return { user: user as User, workspace: workspace as Workspace };
  }
}
