import { Module } from '@nestjs/common';
import { BaseController } from './base.controller';
import { BaseListController } from './base-list.controller';
import { BaseService } from './base.service';

@Module({
  controllers: [BaseController, BaseListController],
  providers: [BaseService],
  exports: [BaseService],
})
export class BaseModule {}
