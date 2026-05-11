import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { AppLogger } from '../logger/logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, body, headers } = request;
    const correlationId = headers['x-correlation-id'] as string;
    const start = Date.now();

    this.logger.log(
      `→ ${method} ${url}`,
      'HTTP',
      { correlationId, body: this.sanitizeBody(body) },
    );

    return next.handle().pipe(
      tap({
        next: (_data) => {
          const duration = Date.now() - start;
          this.logger.log(
            `← ${method} ${url} [${duration}ms]`,
            'HTTP',
            { correlationId, duration },
          );
        },
        error: (err) => {
          const duration = Date.now() - start;
          this.logger.error(
            `← ${method} ${url} [${duration}ms] ERROR`,
            err.stack,
            'HTTP',
            { correlationId, duration },
          );
        },
      }),
    );
  }

  private sanitizeBody(body: any): any {
    if (!body) return body;
    const sanitized = { ...body };
    // Mask sensitive card data in logs
    if (sanitized.card_number) {
      sanitized.card_number = `****${sanitized.card_number.slice(-4)}`;
    }
    if (sanitized.cvv) {
      sanitized.cvv = '***';
    }
    return sanitized;
  }
}
