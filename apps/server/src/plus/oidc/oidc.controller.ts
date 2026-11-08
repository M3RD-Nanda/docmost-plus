import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { OidcService } from './oidc.service';
import { CreateOidcProviderDto, UpdateOidcProviderDto } from './dto/oidc.dto';

@Controller('plus/sso')
export class OidcController {
  constructor(
    private readonly oidcService: OidcService,
    private readonly environmentService: EnvironmentService,
  ) {}

  /** Publik: tombol SSO di halaman login. */
  @Get('providers')
  async providers(@AuthWorkspace() workspace: Workspace) {
    return this.oidcService.listEnabled(workspace.id);
  }

  /** URL otorisasi untuk provider tertentu (publik, dipanggil halaman login). */
  @Get(':id/authorize')
  async authorize(
    @AuthWorkspace() workspace: Workspace,
    @Param('id') id: string,
  ) {
    return { url: await this.oidcService.buildAuthorizeUrl(id, workspace.id) };
  }

  /** Callback IdP: tukar code, provisioning, pasang cookie, kembali ke aplikasi. */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: FastifyReply,
  ) {
    const appUrl = this.environmentService.getAppUrl().replace(/\/$/, '');
    if (error || !code || !state) {
      return res.redirect(`${appUrl}/login?sso_error=${encodeURIComponent(error ?? 'invalid_request')}`, 302);
    }
    try {
      const { authToken } = await this.oidcService.handleCallback(code, state);
      res.setCookie('authToken', authToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        expires: this.environmentService.getCookieExpiresIn(),
        secure: this.environmentService.isHttps(),
      });
      return res.redirect(`${appUrl}/home`, 302);
    } catch (err) {
      const message = encodeURIComponent((err as Error).message ?? 'sso_failed');
      return res.redirect(`${appUrl}/login?sso_error=${message}`, 302);
    }
  }

  // --- admin ---

  @UseGuards(JwtAuthGuard)
  @Get('admin/providers')
  async listAll(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.oidcService.listAll(workspace.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/providers')
  async create(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: CreateOidcProviderDto,
  ) {
    return this.oidcService.create(user, workspace, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/providers/:id')
  async update(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Param('id') id: string,
    @Body() dto: UpdateOidcProviderDto,
  ) {
    return this.oidcService.update(user, workspace, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('admin/providers/:id')
  async remove(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Param('id') id: string,
  ) {
    return this.oidcService.remove(user, workspace, id);
  }
}
