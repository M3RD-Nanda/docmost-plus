import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { McpController } from './mcp.controller';
import { AiService } from './ai.service';

@Module({
  controllers: [AiController, McpController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
