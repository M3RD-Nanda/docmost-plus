import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { createHash } from 'node:crypto';
import { LoginDto } from '../../core/auth/dto/login.dto';
import { TokenService } from '../../core/auth/services/token.service';
import { SessionService } from '../../core/session/session.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { comparePasswordHash, isUserDisabled } from '../../common/helpers';
import { decryptSecret, encryptSecret } from './mfa-crypto';
import {
  generateBackupCodes,
  generateTotpSecret,
  otpauthUrl,
  verifyTotp,
} from './totp';

type MfaRow = {
  id: string;
  user_id: string;
  method: string;
  secret: string | null;
  is_enabled: boolean;
  backup_codes: string[] | null;
};

const ISSUER = 'Docmost';

/**
 * Implementasi MFA untuk Docmost Plus.
 * Dipanggil core lewat slot `require('.../ee/mfa/services/mfa.service')` yang
 * sudah kita arahkan ke modul ini (lihat auth.controller.ts, penanda `// plus:`).
 */
@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly userRepo: UserRepo,
    private readonly moduleRef: ModuleRef,
  ) {}

  private get tokenService(): TokenService {
    return this.moduleRef.get(TokenService, { strict: false });
  }

  private get sessionService(): SessionService {
    return this.moduleRef.get(SessionService, { strict: false });
  }

  private get environmentService(): EnvironmentService {
    return this.moduleRef.get(EnvironmentService, { strict: false });
  }

  /**
   * Kontrak yang dipanggil core saat POST /auth/login.
   * - null  → core lanjut ke login biasa (kredensial salah ditangani core)
   * - objek → core memakai hasilnya untuk meminta kode MFA atau langsung login
   */
  async checkMfaRequirements(
    loginInput: LoginDto,
    workspace: Workspace,
    _res: unknown,
  ): Promise<{
    userHasMfa: boolean;
    requiresMfaSetup: boolean;
    isMfaEnforced: boolean;
    authToken?: string;
  } | null> {
    const user = await this.userRepo.findByEmail(loginInput.email, workspace.id, {
      includePassword: true,
    });

    if (!user || isUserDisabled(user)) return null;

    const isPasswordMatch = await comparePasswordHash(
      loginInput.password,
      user.password,
    );
    if (!isPasswordMatch) return null;

    const row = await this.findRow(user.id);
    const isMfaEnforced = Boolean((workspace as Workspace & { enforceMfa?: boolean }).enforceMfa);

    if (row?.is_enabled) {
      return { userHasMfa: true, requiresMfaSetup: false, isMfaEnforced };
    }

    if (isMfaEnforced) {
      return { userHasMfa: false, requiresMfaSetup: true, isMfaEnforced: true };
    }

    // Tidak ada MFA & tidak diwajibkan: selesaikan login seperti biasa.
    await this.userRepo.updateLastLogin(user.id, workspace.id);
    const authToken = await this.sessionService.createSessionAndToken(user);
    return {
      userHasMfa: false,
      requiresMfaSetup: false,
      isMfaEnforced: false,
      authToken,
    };
  }

  async setup(user: User, workspace: Workspace) {
    const existing = await this.findRow(user.id);
    if (existing?.is_enabled) {
      throw new ConflictException('MFA sudah aktif untuk akun ini');
    }

    const secret = generateTotpSecret();
    const encrypted = encryptSecret(secret, this.environmentService.getAppSecret());

    if (existing) {
      await this.table()
        .updateTable('user_mfa')
        .set({ secret: encrypted, is_enabled: false, updated_at: new Date() } as never)
        .where('user_id', '=', user.id)
        .execute();
    } else {
      await this.table()
        .insertInto('user_mfa')
        .values({
          user_id: user.id,
          workspace_id: workspace.id,
          method: 'totp',
          secret: encrypted,
          is_enabled: false,
        } as never)
        .execute();
    }

    return {
      manualKey: secret,
      otpauthUrl: otpauthUrl({
        secret,
        account: user.email,
        issuer: `${ISSUER} (${workspace.name ?? workspace.hostname ?? 'workspace'})`,
      }),
    };
  }

  async enable(user: User, workspace: Workspace, code: string) {
    const row = await this.findRow(user.id);
    if (!row?.secret) {
      throw new BadRequestException('Mulai setup MFA terlebih dahulu');
    }
    if (row.is_enabled) {
      throw new ConflictException('MFA sudah aktif');
    }

    const secret = decryptSecret(row.secret, this.environmentService.getAppSecret());
    if (!verifyTotp(secret, code)) {
      throw new UnauthorizedException('Kode MFA tidak valid');
    }

    const backupCodes = generateBackupCodes();
    await this.table()
      .updateTable('user_mfa')
      .set({
        is_enabled: true,
        backup_codes: backupCodes.map(hashBackupCode),
        updated_at: new Date(),
      } as never)
      .where('user_id', '=', user.id)
      .execute();

    return { backupCodes };
  }

  async disable(user: User, code: string) {
    const row = await this.findRow(user.id);
    if (!row?.is_enabled || !row.secret) {
      throw new BadRequestException('MFA tidak aktif');
    }
    if (!(await this.consumeCode(user.id, row, code))) {
      throw new UnauthorizedException('Kode MFA tidak valid');
    }
    await this.table().deleteFrom('user_mfa').where('user_id', '=', user.id).execute();
    return { disabled: true };
  }

  async regenerateBackupCodes(user: User, code: string) {
    const row = await this.findRow(user.id);
    if (!row?.is_enabled || !row.secret) {
      throw new BadRequestException('MFA tidak aktif');
    }
    if (!(await this.consumeCode(user.id, row, code))) {
      throw new UnauthorizedException('Kode MFA tidak valid');
    }
    const backupCodes = generateBackupCodes();
    await this.table()
      .updateTable('user_mfa')
      .set({ backup_codes: backupCodes.map(hashBackupCode), updated_at: new Date() } as never)
      .where('user_id', '=', user.id)
      .execute();
    return { backupCodes };
  }

  /** Langkah kedua login: tukar mfaToken + kode menjadi sesi penuh. */
  async verify(mfaToken: string, code: string) {
    const payload = await this.tokenService.verifyJwt(mfaToken, 'mfa_token');

    const user = await this.userRepo.findById(payload.sub, payload.workspaceId);
    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException();
    }

    const row = await this.findRow(user.id);
    if (!row?.is_enabled || !row.secret) {
      throw new UnauthorizedException('MFA tidak aktif');
    }
    if (!(await this.consumeCode(user.id, row, code))) {
      throw new UnauthorizedException('Kode MFA tidak valid');
    }

    const authToken = await this.sessionService.createSessionAndToken(user);
    return { authToken };
  }

  async isEnabled(userId: string): Promise<boolean> {
    const row = await this.findRow(userId);
    return Boolean(row?.is_enabled);
  }

  /** TOTP atau kode cadangan; kode cadangan langsung dihapus setelah dipakai. */
  private async consumeCode(userId: string, row: MfaRow, code: string): Promise<boolean> {
    const secret = decryptSecret(row.secret as string, this.environmentService.getAppSecret());

    if (verifyTotp(secret, code)) return true;

    const hashed = hashBackupCode(code);
    const codes = row.backup_codes ?? [];
    if (!codes.includes(hashed)) return false;

    await this.table()
      .updateTable('user_mfa')
      .set({ backup_codes: codes.filter((c) => c !== hashed), updated_at: new Date() } as never)
      .where('user_id', '=', userId)
      .execute();
    return true;
  }

  private async findRow(userId: string): Promise<MfaRow | undefined> {
    return this.table()
      .selectFrom('user_mfa')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst() as Promise<MfaRow | undefined>;
  }

  // ponytail: cast `any` karena tipe DB upstream belum memuat tabel user_mfa.
  // Ganti dengan tipe Kysely begitu tabel itu masuk ke entity.types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private table(): any {
    return this.db as unknown as {
      selectFrom: (t: string) => any;
      updateTable: (t: string) => any;
      insertInto: (t: string) => any;
      deleteFrom: (t: string) => any;
    };
  }
}

function hashBackupCode(code: string): string {
  return createHash('sha256')
    .update(code.replace(/[\s-]/g, '').toUpperCase())
    .digest('hex');
}
