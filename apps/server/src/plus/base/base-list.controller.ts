import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { BaseService } from './base.service';

/**
 * Endpoint tingkat workspace (bukan per-page) supaya tidak bentrok
 * dengan route `/plus/base/:pageId`.
 */
@UseGuards(JwtAuthGuard)
@Controller('plus/bases')
export class BaseListController {
  constructor(private readonly baseService: BaseService) {}

  @Get()
  async list(@AuthWorkspace() workspace: Workspace, @AuthUser() user: User) {
    return this.baseService.listBasePages(workspace, user);
  }

  @Post(':pageId')
  async setBase(
    @Param('pageId') pageId: string,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
    @Body() dto: { isBase?: boolean },
  ) {
    return this.baseService.setBase(pageId, workspace, user, dto.isBase !== false);
  }
}
