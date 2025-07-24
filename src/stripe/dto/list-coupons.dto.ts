import { IsOptional, IsNumber, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListCouponsDto {
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => {
    const parsed = parseInt(value);
    return isNaN(parsed) ? undefined : parsed;
  })
  limit?: number;

  @IsOptional()
  @IsString()
  starting_after?: string;

  @IsOptional()
  @IsString()
  ending_before?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => {
    const parsed = parseInt(value);
    return isNaN(parsed) ? undefined : parsed;
  })
  created?: number;
} 