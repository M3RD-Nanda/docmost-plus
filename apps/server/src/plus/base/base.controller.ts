import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { BaseService } from './base.service';

@UseGuards(JwtAuthGuard)
@Controller('plus/base/:pageId')
export class BaseController {
  constructor(private readonly baseService: BaseService) {}

  @Get()
  async schema(
    @Param('pageId') pageId: string,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    return this.baseService.schema(pageId, workspace, user);
  }

  @Post('properties')
  async addProperty(
    @Param('pageId') pageId: string,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
    @Body() dto: { id?: string; name: string; type: any; typeOptions?: unknown },
  ) {
    return this.baseService.addProperty(pageId, workspace, user, dto);
  }

  @Patch('properties/:propertyId')
  async updateProperty(
    @Param('pageId') pageId: string,
    @Param('propertyId') propertyId: string,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
    @Body() dto: { name?: string; typeOptions?: unknown },
  ) {
    return this.baseService.updateProperty(pageId, propertyId, workspace, user, dto);
  }

  @Delete('properties/:propertyId')
  async removeProperty(
    @Param('pageId') pageId: string,
    @Param('propertyId') propertyId: string,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    return this.baseService.removeProperty(pageId, propertyId, workspace, user);
  }

  @Get('rows')
  async rows(
    @Param('pageId') pageId: string,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: 'asc' | 'desc',
    @Query('type') type?: string,
  ) {
    return this.baseService.rows(pageId, workspace, user, { limit: Number(limit), cursor, sort, dir, type });
  }

  @Post('rows')
  async addRow(
    @Param('pageId') pageId: string,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
    @Body() dto: { cells?: Record<string, unknown> },
  ) {
    return this.baseService.addRow(pageId, workspace, user, dto);
  }

  @Patch('rows/:rowId')
  async updateRow(
    @Param('pageId') pageId: string,
    @Param('rowId') rowId: string,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
    @Body() dto: { cells: Record<string, unknown> },
  ) {
    return this.baseService.updateRow(pageId, rowId, workspace, user, dto);
  }

  @Delete('rows/:rowId')
  async removeRow(
    @Param('pageId') pageId: string,
    @Param('rowId') rowId: string,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    return this.baseService.removeRow(pageId, rowId, workspace, user);
  }

  @Post('views')
  async addView(
    @Param('pageId') pageId: string,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
    @Body() dto: { name: string; type?: 'table' | 'kanban' | 'list'; config?: unknown },
  ) {
    return this.baseService.addView(pageId, workspace, user, dto);
  }

  @Patch('views/:viewId')
  async updateView(
    @Param('pageId') pageId: string,
    @Param('viewId') viewId: string,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
    @Body() dto: { name?: string; type?: string; config?: unknown },
  ) {
    return this.baseService.updateView(pageId, viewId, workspace, user, dto);
  }
}
