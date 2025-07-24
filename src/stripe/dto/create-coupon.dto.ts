import { IsOptional, IsString, IsNumber, IsBoolean, IsEnum, Min, Max, ValidateIf, Validate } from 'class-validator';

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
  @IsOptional()
  @IsString()
  id?: string;

  @ValidateIf((o) => !o.amount_off)
  @IsNumber()
  @Min(1)
  @Max(100)
  percent_off?: number;

  @ValidateIf((o) => !o.percent_off)
  @IsNumber()
  @Min(1)
  amount_off?: number;

  // Custom validation to ensure exactly one discount type is provided
  @Validate((value, args) => {
    const obj = args.object as CreateCouponDto;
    const hasPercentOff = obj.percent_off !== undefined && obj.percent_off !== null;
    const hasAmountOff = obj.amount_off !== undefined && obj.amount_off !== null;
    
    if (!hasPercentOff && !hasAmountOff) {
      return false; // At least one discount type is required
    }
    
    if (hasPercentOff && hasAmountOff) {
      return false; // Only one discount type should be provided
    }
    
    return true;
  }, { message: 'Exactly one of percent_off or amount_off must be provided' })
  _discountValidation?: any;

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