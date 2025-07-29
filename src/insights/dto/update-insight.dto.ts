import { IsString, IsOptional, IsNotEmpty, IsBoolean, MaxLength } from 'class-validator';

export class UpdateInsightDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000) // Reasonable limit for text fields
  comparison_between_variants?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  purchase_drivers?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  competitive_insights?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  recommendations?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  comment_summary?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  edited?: boolean;
} 