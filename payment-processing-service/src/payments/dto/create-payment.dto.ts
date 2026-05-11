import {
  IsString,
  IsNumber,
  IsEnum,
  IsNotEmpty,
  Min,
  Length,
  IsOptional,
  ValidateNested,
  IsNumberString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Currency } from '../schemas/transaction.schema';

export class CardDto {
  @IsNotEmpty()
  @IsNumberString()
  @Length(13, 19, { message: 'Card number must be between 13 and 19 digits' })
  card_number: string;

  @IsNotEmpty()
  @IsString()
  @Length(1, 100)
  holder_name: string;

  @IsNotEmpty()
  @IsNumberString()
  @Length(2, 2, { message: 'Expiry month must be 2 digits (MM)' })
  expiry_month: string;

  @IsNotEmpty()
  @IsNumberString()
  @Length(4, 4, { message: 'Expiry year must be 4 digits (YYYY)' })
  expiry_year: string;

  @IsNotEmpty()
  @IsNumberString()
  @Length(3, 4, { message: 'CVV must be 3 or 4 digits' })
  cvv: string;
}

export class CreatePaymentDto {
  @IsNotEmpty()
  @IsString()
  merchant_id: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1, { message: 'Amount must be at least 1' })
  amount: number;

  @IsEnum(Currency, {
    message: `Currency must be one of: ${Object.values(Currency).join(', ')}`,
  })
  currency: Currency;

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => CardDto)
  card: CardDto;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  idempotency_key?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  correlation_id?: string;
}
