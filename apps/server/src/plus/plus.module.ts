import { Module } from '@nestjs/common';
import { MfaModule } from './mfa/mfa.module';
import { ApiKeyModule } from './apikey/api-key.module';
import { AttachmentIndexModule } from './attachment-index/attachment-index.module';
import { OidcModule } from './oidc/oidc.module';
import { AiModule } from './ai/ai.module';
import { BaseModule } from './base/base.module';

/**
 * Titik masuk semua fitur Docmost Plus.
 * Didaftarkan sekali di app.module.ts (penanda `// plus:`).
 */
@Module({
  imports: [MfaModule, ApiKeyModule, AttachmentIndexModule, OidcModule, AiModule, BaseModule],
  exports: [MfaModule, ApiKeyModule, AttachmentIndexModule, OidcModule, AiModule, BaseModule],
})
export class PlusModule {}
