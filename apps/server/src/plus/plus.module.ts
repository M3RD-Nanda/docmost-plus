import { Module } from '@nestjs/common';
import { MfaModule } from './mfa/mfa.module';
import { ApiKeyModule } from './apikey/api-key.module';

/**
 * Titik masuk semua fitur Docmost Plus.
 * Didaftarkan sekali di app.module.ts (penanda `// plus:`).
 */
@Module({
  imports: [MfaModule, ApiKeyModule],
  exports: [MfaModule, ApiKeyModule],
})
export class PlusModule {}
