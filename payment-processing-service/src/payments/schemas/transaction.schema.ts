import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TransactionDocument = Transaction & Document;

export enum TransactionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
  FAILED = 'FAILED',
}

export enum Currency {
  USD = 'USD',
  EUR = 'EUR',
  CLP = 'CLP',
  MXN = 'MXN',
  BRL = 'BRL',
  ARS = 'ARS',
}

@Schema({ _id: false })
class CardInfo {
  @Prop({ required: true })
  last_four: string;

  @Prop({ required: true })
  brand: string;

  @Prop({ required: true })
  expiry_month: string;

  @Prop({ required: true })
  expiry_year: string;

  @Prop({ required: true })
  holder_name: string;
}

@Schema({ _id: false })
export class StatusTransition {
  @Prop({ required: false, enum: [...Object.values(TransactionStatus), null], default: null })
  from: TransactionStatus | null;

  @Prop({ required: true, enum: TransactionStatus })
  to: TransactionStatus;

  @Prop({ required: true })
  timestamp: Date;

  @Prop()
  reason?: string;
}

@Schema({ _id: false })
class AcquirerResponse {
  @Prop()
  authorization_code?: string;

  @Prop()
  response_code?: string;

  @Prop()
  response_message?: string;

  @Prop()
  acquirer_transaction_id?: string;

  @Prop()
  processed_at?: Date;
}

@Schema({
  collection: 'transactions',
  timestamps: true,
  versionKey: false,
})
export class Transaction {
  @Prop({ required: true, unique: true, index: true })
  transaction_id: string;

  @Prop({ required: true, index: true })
  merchant_id: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, enum: Currency })
  currency: string;

  @Prop({
    required: true,
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
    index: true,
  })
  status: TransactionStatus;

  @Prop({ type: CardInfo, required: true })
  card: CardInfo;

  @Prop({ type: AcquirerResponse })
  acquirer_response?: AcquirerResponse;

  @Prop({ type: [StatusTransition], default: [] })
  status_history: StatusTransition[];

  @Prop()
  failure_reason?: string;

  @Prop({ index: true })
  idempotency_key?: string;

  @Prop({ default: 0 })
  acquirer_retry_count: number;

  @Prop()
  correlation_id?: string;

  // Timestamps added automatically by mongoose (createdAt, updatedAt)
  createdAt?: Date;
  updatedAt?: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

// Compound indexes for query optimization
TransactionSchema.index({ merchant_id: 1, status: 1 });
TransactionSchema.index({ idempotency_key: 1 }, { unique: true, sparse: true });
TransactionSchema.index({ createdAt: -1 });
