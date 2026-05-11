import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsRepository } from './payments.repository';
import { Transaction, TransactionSchema } from './schemas/transaction.schema';
import { AcquirerModule } from '../acquirer/acquirer.module';
import { AppLogger } from '../common/logger/logger.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    AcquirerModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository, AppLogger],
})
export class PaymentsModule {}
