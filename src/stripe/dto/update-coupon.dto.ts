import { IsOptional, IsString, IsNumber, IsBoolean, IsEnum, Min, Max } from 'class-validator';
import { CouponDuration } from './create-coupon.dto';

export class UpdateCouponDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  valid?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  max_redemptions?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  redeem_by?: number;
} 