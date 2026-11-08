import { Module } from '@nestjs/common';
import { OidcController } from './oidc.controller';
import { OidcService } from './oidc.service';

@Module({
  controllers: [OidcController],
  providers: [OidcService],
  exports: [OidcService],
})
export class OidcModule {}
