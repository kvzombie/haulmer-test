import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppLogger } from '../logger/logger.service';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || exception.message;
        errors = (exceptionResponse as any).errors;
      } else {
        message = exceptionResponse;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const correlationId = request.headers['x-correlation-id'] as string;

    this.logger.error(
      `[${request.method}] ${request.url} → ${status}: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
      'GlobalExceptionFilter',
      { correlationId, status },
    );

    response.status(status).json({
      statusCode: status,
      message,
      ...(errors && { errors }),
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(correlationId && { correlationId }),
    });
  }
}
