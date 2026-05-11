import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { PaymentsRepository } from './payments.repository';
import { AcquirerService } from '../acquirer/acquirer.service';
import { AppLogger } from '../common/logger/logger.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';
import { TransactionDocument, TransactionStatus } from './schemas/transaction.schema';

@Injectable()
export class PaymentsService {
  private readonly maxAmount: number;
  private readonly minAmount: number;

  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly acquirerService: AcquirerService,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.maxAmount = this.configService.get<number>('businessRules.maxTransactionAmount');
    this.minAmount = this.configService.get<number>('businessRules.minTransactionAmount');
  }

  async createPayment(dto: CreatePaymentDto): Promise<TransactionDocument> {
    // ── 1. Idempotency check ──────────────────────────────────────────────
    if (dto.idempotency_key) {
      const existing = await this.paymentsRepository.findByIdempotencyKey(
        dto.idempotency_key,
      );
      if (existing) {
        this.logger.log(
          `Duplicate request detected for idempotency_key: ${dto.idempotency_key}`,
          'PaymentsService',
          { transactionId: existing.transaction_id },
        );
        return existing;
      }
    }

    // ── 2. Business rules validation ──────────────────────────────────────
    this.validateBusinessRules(dto);

    const transactionId = uuidv4();

    this.logger.logWithTransaction(
      'info',
      'Creating new transaction',
      transactionId,
      {
        merchant_id: dto.merchant_id,
        amount: dto.amount,
        currency: dto.currency,
        correlation_id: dto.correlation_id,
      },
    );

    // ── 3. Persist with PENDING status ───────────────────────────────────
    await this.paymentsRepository.create({
      transaction_id: transactionId,
      merchant_id: dto.merchant_id,
      amount: dto.amount,
      currency: dto.currency,
      status: TransactionStatus.PENDING,
      card: {
        last_four: dto.card.card_number.slice(-4),
        brand: this.detectCardBrand(dto.card.card_number),
        expiry_month: dto.card.expiry_month,
        expiry_year: dto.card.expiry_year,
        holder_name: dto.card.holder_name,
      },
      idempotency_key: dto.idempotency_key,
      correlation_id: dto.correlation_id,
      status_history: [
        {
          from: null,
          to: TransactionStatus.PENDING,
          timestamp: new Date(),
          reason: 'Transaction created',
        },
      ],
    });

    // ── 4. Validate card expiry ───────────────────────────────────────────
    const cardValidation = this.validateCard(dto.card);
    if (!cardValidation.valid) {
      await this.paymentsRepository.updateStatus(
        transactionId,
        TransactionStatus.DECLINED,
        { failure_reason: cardValidation.reason },
        TransactionStatus.PENDING,
        cardValidation.reason,
      );
      this.logger.logWithTransaction(
        'warn',
        `Transaction declined due to card validation: ${cardValidation.reason}`,
        transactionId,
      );
      return this.paymentsRepository.findById(transactionId);
    }

    // ── 5. Transition to PROCESSING ──────────────────────────────────────
    await this.paymentsRepository.updateStatus(
      transactionId,
      TransactionStatus.PROCESSING,
      {},
      TransactionStatus.PENDING,
      'Sending to acquirer',
    );

    this.logger.logWithTransaction(
      'info',
      'Transaction moved to PROCESSING',
      transactionId,
    );

    // ── 6. Send to acquirer ───────────────────────────────────────────────
    try {
      const acquirerResponse = await this.acquirerService.authorize({
        transaction_id: transactionId,
        merchant_id: dto.merchant_id,
        amount: dto.amount,
        currency: dto.currency,
        card: {
          number: dto.card.card_number,
          holder_name: dto.card.holder_name,
          expiry_month: dto.card.expiry_month,
          expiry_year: dto.card.expiry_year,
          cvv: dto.card.cvv,
        },
      });

      const finalStatus = acquirerResponse.approved
        ? TransactionStatus.APPROVED
        : TransactionStatus.DECLINED;

      const updated = await this.paymentsRepository.updateStatus(
        transactionId,
        finalStatus,
        {
          acquirer_response: {
            authorization_code: acquirerResponse.authorization_code,
            response_code: acquirerResponse.response_code,
            response_message: acquirerResponse.response_message,
            acquirer_transaction_id: acquirerResponse.acquirer_transaction_id,
            processed_at: new Date(),
          },
        },
        TransactionStatus.PROCESSING,
        acquirerResponse.response_message,
      );

      this.logger.logWithTransaction(
        'info',
        `Transaction ${finalStatus}`,
        transactionId,
        {
          authorization_code: acquirerResponse.authorization_code,
          response_code: acquirerResponse.response_code,
        },
      );

      return updated;
    } catch (error: any) {
      // Acquirer call failed completely
      const failed = await this.paymentsRepository.updateStatus(
        transactionId,
        TransactionStatus.FAILED,
        { failure_reason: `Acquirer error: ${error.message}` },
        TransactionStatus.PROCESSING,
        `Acquirer unreachable: ${error.message}`,
      );

      this.logger.error(
        `Transaction FAILED due to acquirer error`,
        error.stack,
        'PaymentsService',
        { transactionId },
      );

      return failed;
    }
  }

  async findById(transactionId: string): Promise<TransactionDocument> {
    const transaction = await this.paymentsRepository.findById(transactionId);
    if (!transaction) {
      throw new NotFoundException(
        `Transaction ${transactionId} not found`,
      );
    }
    return transaction;
  }

  async findMany(query: QueryPaymentDto) {
    const filters: any = {};
    if (query.merchant_id) filters.merchant_id = query.merchant_id;
    if (query.status) filters.status = query.status;

    const { data, total } = await this.paymentsRepository.findMany(
      filters,
      query.page,
      query.limit,
    );

    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private validateBusinessRules(dto: CreatePaymentDto): void {
    if (dto.amount < this.minAmount) {
      throw new BadRequestException(
        `Amount must be at least ${this.minAmount}`,
      );
    }
    if (dto.amount > this.maxAmount) {
      throw new BadRequestException(
        `Amount exceeds maximum allowed: ${this.maxAmount}`,
      );
    }
  }

  private validateCard(card: CreatePaymentDto['card']): { valid: boolean; reason?: string } {
    const now = new Date();
    const expiryYear = parseInt(card.expiry_year, 10);
    const expiryMonth = parseInt(card.expiry_month, 10);

    if (expiryMonth < 1 || expiryMonth > 12) {
      return { valid: false, reason: 'Invalid expiry month' };
    }

    const expiryDate = new Date(expiryYear, expiryMonth, 0); // last day of expiry month
    if (expiryDate < now) {
      return { valid: false, reason: 'Card is expired' };
    }

    if (!this.luhnCheck(card.card_number)) {
      return { valid: false, reason: 'Invalid card number (Luhn check failed)' };
    }

    return { valid: true };
  }

  /**
   * Luhn algorithm to validate card numbers
   */
  private luhnCheck(cardNumber: string): boolean {
    const digits = cardNumber.replace(/\D/g, '');
    let sum = 0;
    let shouldDouble = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i], 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }

    return sum % 10 === 0;
  }

  private detectCardBrand(cardNumber: string): string {
    const num = cardNumber.replace(/\D/g, '');
    if (/^4/.test(num)) return 'VISA';
    if (/^5[1-5]/.test(num) || /^2[2-7]/.test(num)) return 'MASTERCARD';
    if (/^3[47]/.test(num)) return 'AMEX';
    if (/^6(?:011|5)/.test(num)) return 'DISCOVER';
    return 'UNKNOWN';
  }
}
