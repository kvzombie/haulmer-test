import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
  StatusTransition,
} from './schemas/transaction.schema';

@Injectable()
export class PaymentsRepository {
  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  async create(data: Partial<Transaction>): Promise<TransactionDocument> {
    const transaction = new this.transactionModel(data);
    return transaction.save();
  }

  async findById(transactionId: string): Promise<TransactionDocument | null> {
    return this.transactionModel
      .findOne({ transaction_id: transactionId })
      .exec();
  }

  async findByIdempotencyKey(key: string): Promise<TransactionDocument | null> {
    return this.transactionModel
      .findOne({ idempotency_key: key })
      .exec();
  }

  async findMany(
    filters: FilterQuery<TransactionDocument>,
    page: number,
    limit: number,
  ): Promise<{ data: TransactionDocument[]; total: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.transactionModel
        .find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.transactionModel.countDocuments(filters).exec(),
    ]);
    return { data, total };
  }

  async updateStatus(
    transactionId: string,
    newStatus: TransactionStatus,
    update: Partial<Transaction>,
    previousStatus: TransactionStatus,
    reason?: string,
  ): Promise<TransactionDocument | null> {
    const transition: StatusTransition = {
      from: previousStatus,
      to: newStatus,
      timestamp: new Date(),
      reason,
    };

    return this.transactionModel
      .findOneAndUpdate(
        { transaction_id: transactionId },
        {
          $set: { status: newStatus, ...update },
          $push: { status_history: transition },
        },
        { new: true },
      )
      .exec();
  }

  async incrementRetryCount(transactionId: string): Promise<void> {
    await this.transactionModel
      .updateOne(
        { transaction_id: transactionId },
        { $inc: { acquirer_retry_count: 1 } },
      )
      .exec();
  }
}
