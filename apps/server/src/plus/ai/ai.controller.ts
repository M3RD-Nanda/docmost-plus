import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ALL_NAMED_THROTTLERS_SKIPPED,
  AI_CHAT_THROTTLER,
} from '../../integrations/throttle/throttler-names';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AiService } from './ai.service';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

class ChatDto {
  @IsOptional()
  @IsString()
  chatId?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(4000)
  message: string;
}

@UseGuards(JwtAuthGuard)
@SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AI_CHAT_THROTTLER]: false })
@UseGuards(ThrottlerGuard)
@Controller('plus/ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  async chat(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: ChatDto,
  ) {
    return this.aiService.chat(user, workspace, dto);
  }

  @Get('chats')
  async chats(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.aiService.listChats(user, workspace);
  }

  @Get('chats/:id/messages')
  async messages(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Param('id') id: string,
  ) {
    return this.aiService.getMessages(user, workspace, id);
  }
}
