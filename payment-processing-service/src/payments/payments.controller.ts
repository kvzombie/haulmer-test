import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * POST /payments
   * Process a new payment request
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPayment(
    @Body() dto: CreatePaymentDto,
    @Headers('x-idempotency-key') idempotencyKeyHeader?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    // Allow idempotency key from header OR body (header takes precedence)
    if (idempotencyKeyHeader && !dto.idempotency_key) {
      dto.idempotency_key = idempotencyKeyHeader;
    }
    if (correlationId && !dto.correlation_id) {
      dto.correlation_id = correlationId;
    }

    const transaction = await this.paymentsService.createPayment(dto);
    return this.formatTransaction(transaction);
  }

  /**
   * GET /payments/:transaction_id
   * Get a single transaction by ID
   */
  @Get(':transaction_id')
  async findOne(@Param('transaction_id') transactionId: string) {
    const transaction = await this.paymentsService.findById(transactionId);
    return this.formatTransaction(transaction);
  }

  /**
   * GET /payments?merchant_id=...&status=...
   * Query transactions with filters and pagination
   */
  @Get()
  async findMany(@Query() query: QueryPaymentDto) {
    const result = await this.paymentsService.findMany(query);
    return {
      data: result.data.map((t) => this.formatTransaction(t)),
      meta: result.meta,
    };
  }

  private formatTransaction(transaction: any) {
    return {
      transaction_id: transaction.transaction_id,
      merchant_id: transaction.merchant_id,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      card: {
        last_four: transaction.card?.last_four,
        brand: transaction.card?.brand,
        holder_name: transaction.card?.holder_name,
        expiry_month: transaction.card?.expiry_month,
        expiry_year: transaction.card?.expiry_year,
      },
      acquirer_response: transaction.acquirer_response,
      failure_reason: transaction.failure_reason,
      status_history: transaction.status_history,
      correlation_id: transaction.correlation_id,
      created_at: transaction.createdAt,
      updated_at: transaction.updatedAt,
    };
  }
}
