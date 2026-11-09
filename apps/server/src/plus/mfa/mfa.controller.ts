import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ALL_NAMED_THROTTLERS_SKIPPED,
  AUTH_THROTTLER,
} from '../../integrations/throttle/throttler-names';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { MfaService } from './mfa.service';
import { EnableMfaDto, MfaCodeDto, VerifyMfaDto } from './dto/mfa.dto';

// Kode TOTP 6 digit: tanpa batas percobaan, brute-force realistis.
@SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false })
@UseGuards(ThrottlerGuard)
@Controller('plus/mfa')
export class MfaController {
  constructor(
    private readonly mfaService: MfaService,
    private readonly environmentService: EnvironmentService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async status(@AuthUser() user: User) {
    return { enabled: await this.mfaService.isEnabled(user.id) };
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('setup')
  async setup(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.mfaService.setup(user, workspace);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('enable')
  async enable(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: EnableMfaDto,
  ) {
    return this.mfaService.enable(user, workspace, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('disable')
  async disable(@AuthUser() user: User, @Body() dto: MfaCodeDto) {
    return this.mfaService.disable(user, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('backup-codes')
  async backupCodes(@AuthUser() user: User, @Body() dto: MfaCodeDto) {
    return this.mfaService.regenerateBackupCodes(user, dto.code);
  }

  /** Dipanggil halaman login setelah server menjawab `userHasMfa: true`. */
  @HttpCode(HttpStatus.OK)
  @Post('verify')
  async verify(
    @Body() dto: VerifyMfaDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { authToken } = await this.mfaService.verify(dto);

    res.setCookie('authToken', authToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: this.environmentService.getCookieExpiresIn(),
      secure: this.environmentService.isHttps(),
    });

    return { ok: true };
  }
}
