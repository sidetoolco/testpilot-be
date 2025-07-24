import { IsOptional, IsNumber, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListCouponsDto {
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  limit?: number;

  @IsOptional()
  @IsString()
  starting_after?: string;

  @IsOptional()
  @IsString()
  ending_before?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  created?: number;
} 