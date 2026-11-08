import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@UseGuards(JwtAuthGuard)
@Controller('plus/api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Get()
  async list(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.apiKeyService.list(user, workspace.id);
  }

  @HttpCode(HttpStatus.CREATED)
  @Post()
  async create(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeyService.create(user, workspace.id, dto);
  }

  @Delete(':id')
  async revoke(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Param('id') id: string,
  ) {
    return this.apiKeyService.revoke(user, workspace.id, id);
  }
}
