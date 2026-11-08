import { Module } from '@nestjs/common';
import { AttachmentEeService } from './attachment-index.service';
import { AttachmentSearchService } from './attachment-search.service';
import { AttachmentSearchController } from './attachment-search.controller';

@Module({
  controllers: [AttachmentSearchController],
  providers: [AttachmentEeService, AttachmentSearchService],
  exports: [AttachmentEeService],
})
export class AttachmentIndexModule {}
