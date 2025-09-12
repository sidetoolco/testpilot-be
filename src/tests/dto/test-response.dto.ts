import { IsString, IsNumber, IsOptional, IsUUID, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class TestTimeDto {
  @IsString()
  @IsOptional()
  product_id?: string;

  @IsString()
  @IsOptional()
  competitor_id?: string;

  @IsString()
  @IsOptional()
  walmart_product_id?: string;

  @IsNumber()
  time_spent: number;

  @IsNumber()
  @IsOptional()
  click?: number;
}

export class TestResponseDto {
  @IsString()
  test_id: string;

  @IsString()
  tester_id: string;

  @IsString()
  product_id: string;

  @IsString()
  competitor_id: string;

  @IsNumber()
  value: number;

  @IsNumber()
  appearance: number;

  @IsNumber()
  confidence: number;

  @IsNumber()
  brand: number;

  @IsNumber()
  convenience: number;

  @IsString()
  likes_most: string;

  @IsString()
  improve_suggestions: string;

  @IsString()
  choose_reason: string;

  @IsNumber()
  @IsOptional()
  appetizing?: number;

  @IsNumber()
  @IsOptional()
  target_audience?: number;

  @IsNumber()
  @IsOptional()
  novelty?: number;
}

export class TestSessionDto {
  @IsString()
  test_id: string;

  @IsString()
  prolific_pid: string;

  @IsString()
  variation_type: string;

  @IsString()
  @IsOptional()
  product_id?: string;

  @IsString()
  @IsOptional()
  competitor_id?: string;

  @IsString()
  @IsOptional()
  walmart_product_id?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  ended_at?: string;
}

export class SubmitTestResponseDto {
  @ValidateNested()
  @Type(() => TestSessionDto)
  session: TestSessionDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestTimeDto)
  timing_data: TestTimeDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestResponseDto)
  responses: TestResponseDto[];
}
