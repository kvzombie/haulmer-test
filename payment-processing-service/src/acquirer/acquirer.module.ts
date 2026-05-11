import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AcquirerService } from './acquirer.service';
import { AppLogger } from '../common/logger/logger.service';

@Module({
  imports: [HttpModule],
  providers: [AcquirerService, AppLogger],
  exports: [AcquirerService],
})
export class AcquirerModule {}
