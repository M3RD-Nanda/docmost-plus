import { Module } from '@nestjs/common';
import { AttachmentEeService } from './attachment-index.service';

@Module({
  providers: [AttachmentEeService],
  exports: [AttachmentEeService],
})
export class AttachmentIndexModule {}
