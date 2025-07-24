import { IsOptional, IsString, IsNumber, IsBoolean, IsEnum, Min, Max } from 'class-validator';

export enum CouponType {
  PERCENT_OFF = 'percent_off',
  AMOUNT_OFF = 'amount_off',
}

export enum CouponDuration {
  ONCE = 'once',
  REPEATING = 'repeating',
  FOREVER = 'forever',
}

export class CreateCouponDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percent_off?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount_off?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(CouponDuration)
  duration?: CouponDuration;

  @IsOptional()
  @IsNumber()
  @Min(1)
  duration_in_months?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  max_redemptions?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  redeem_by?: number;

  @IsOptional()
  @IsBoolean()
  valid?: boolean;

  @IsOptional()
  @IsString()
  name?: string;
} 