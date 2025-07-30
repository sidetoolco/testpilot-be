import { IsNotEmpty, IsNumber, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class EditCreditsDto {
  @IsNotEmpty()
  @IsUUID()
  company_id: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  credits: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  description: string;
} 