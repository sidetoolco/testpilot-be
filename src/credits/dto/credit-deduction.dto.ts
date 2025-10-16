import { IsNotEmpty, IsInt, IsString, MaxLength, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreditDeductionRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Credits must be a positive integer' })
  credits: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description: string;
}

export class CreditDeductionResponseDto {
  success: boolean;
  message: string;
  remaining_credits: number;
}
