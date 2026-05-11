import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionStatus } from '../schemas/transaction.schema';

export class QueryPaymentDto {
  @IsOptional()
  @IsString()
  merchant_id?: string;

  @IsOptional()
  @IsEnum(TransactionStatus, {
    message: `Status must be one of: ${Object.values(TransactionStatus).join(', ')}`,
  })
  status?: TransactionStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
