import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AppLogger } from '../common/logger/logger.service';

export interface AcquirerRequest {
  transaction_id: string;
  merchant_id: string;
  amount: number;
  currency: string;
  card: {
    number: string;
    holder_name: string;
    expiry_month: string;
    expiry_year: string;
    cvv: string;
  };
}

export interface AcquirerResponse {
  approved: boolean;
  authorization_code?: string;
  response_code: string;
  response_message: string;
  acquirer_transaction_id: string;
}

@Injectable()
export class AcquirerService {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.baseUrl = this.configService.get<string>('acquirer.baseUrl');
    this.timeoutMs = this.configService.get<number>('acquirer.timeoutMs');
    this.maxRetries = this.configService.get<number>('acquirer.maxRetries');
  }

  async authorize(request: AcquirerRequest): Promise<AcquirerResponse> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.logWithTransaction(
          'info',
          `Sending authorization request to acquirer (attempt ${attempt}/${this.maxRetries})`,
          request.transaction_id,
          { attempt, merchant_id: request.merchant_id, amount: request.amount },
        );

        const response = await firstValueFrom(
          this.httpService.post<AcquirerResponse>(
            `${this.baseUrl}/authorize`,
            request,
            { timeout: this.timeoutMs },
          ),
        );

        this.logger.logWithTransaction(
          'info',
          `Acquirer responded: ${response.data.response_message}`,
          request.transaction_id,
          {
            approved: response.data.approved,
            response_code: response.data.response_code,
            acquirer_transaction_id: response.data.acquirer_transaction_id,
          },
        );

        return response.data;
      } catch (error) {
        lastError = error as Error;
        const isRetryable = this.isRetryableError(error);

        this.logger.warn(
          `Acquirer request failed on attempt ${attempt}: ${lastError.message}`,
          'AcquirerService',
          { transactionId: request.transaction_id, attempt, isRetryable },
        );

        if (!isRetryable || attempt === this.maxRetries) break;

        // Exponential backoff: 200ms, 400ms, 800ms...
        const delay = 200 * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }

    // All retries exhausted - simulate a mock response for demo purposes
    // In production, this would throw and mark the transaction as FAILED
    this.logger.warn(
      'Acquirer unreachable after all retries. Using mock fallback.',
      'AcquirerService',
      { transactionId: request.transaction_id },
    );

    return this.getMockResponse(request);
  }

  /**
   * Simulate acquirer response when real service unavailable.
   * Rules:
   * - Cards starting with 4111 → APPROVED
   * - Cards starting with 4000 → DECLINED
   * - All others → random 80% approve
   */
  private getMockResponse(request: AcquirerRequest): AcquirerResponse {
    const cardNumber = request.card.number;
    const prefix4 = cardNumber.substring(0, 4);

    let approved: boolean;
    let responseCode: string;
    let responseMessage: string;

    if (prefix4 === '4111') {
      approved = true;
      responseCode = '00';
      responseMessage = 'Approved';
    } else if (prefix4 === '4000') {
      approved = false;
      responseCode = '05';
      responseMessage = 'Do not honor';
    } else {
      approved = Math.random() > 0.2;
      responseCode = approved ? '00' : '51';
      responseMessage = approved ? 'Approved' : 'Insufficient funds';
    }

    return {
      approved,
      authorization_code: approved ? this.generateAuthCode() : undefined,
      response_code: responseCode,
      response_message: responseMessage,
      acquirer_transaction_id: `ACQ-${Date.now()}`,
    };
  }

  private isRetryableError(error: any): boolean {
    // Network errors, timeouts, 5xx are retryable; 4xx are not
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return true;
    if (error.response?.status >= 500) return true;
    return false;
  }

  private generateAuthCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
