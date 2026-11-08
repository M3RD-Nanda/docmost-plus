import { Module } from '@nestjs/common';
import { MfaModule } from './mfa/mfa.module';
import { ApiKeyModule } from './apikey/api-key.module';
import { AttachmentIndexModule } from './attachment-index/attachment-index.module';

/**
 * Titik masuk semua fitur Docmost Plus.
 * Didaftarkan sekali di app.module.ts (penanda `// plus:`).
 */
@Module({
  imports: [MfaModule, ApiKeyModule, AttachmentIndexModule],
  exports: [MfaModule, ApiKeyModule, AttachmentIndexModule],
})
export class PlusModule {}
