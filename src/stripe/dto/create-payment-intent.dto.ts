import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsNotEmpty()
  @IsNumber()
  credits: number;

  @IsOptional()
  @IsString()
  couponId?: string;
}
