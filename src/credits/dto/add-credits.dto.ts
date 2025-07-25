import { IsNotEmpty, IsNumber, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';

export class AddCreditsDto {
  @IsNotEmpty()
  @IsUUID()
  company_id: string;

  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  credits: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  description: string;
} 