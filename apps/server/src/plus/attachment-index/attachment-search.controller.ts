import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AttachmentSearchService } from './attachment-search.service';

@UseGuards(JwtAuthGuard)
@Controller('plus/search')
export class AttachmentSearchController {
  constructor(private readonly searchService: AttachmentSearchService) {}

  @Get('attachments')
  async search(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Query('q') query: string,
  ) {
    return this.searchService.search(user, workspace, query);
  }
}
