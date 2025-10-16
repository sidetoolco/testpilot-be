import { IsNotEmpty, IsNumber, IsString, MaxLength, Min } from 'class-validator';

export class CreditDeductionRequestDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(1, { message: 'Credits must be a positive number' })
  credits: number;

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
