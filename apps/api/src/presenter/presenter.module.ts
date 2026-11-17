import { Module } from '@nestjs/common';
import { PresenterController } from './presenter.controller';
import { PresenterService } from './presenter.service';

@Module({
  controllers: [PresenterController],
  providers: [PresenterService],
  exports: [PresenterService],
})
export class PresenterModule {}
