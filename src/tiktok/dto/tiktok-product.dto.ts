import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class TikTokProduct {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  tiktok_id?: string;

  @IsString()
  title: string;

  @IsString()
  image_url: string;

  @IsOptional()
  @IsString()
  product_url?: string | null;

  @Type(() => Number)
  @IsNumber()
  price: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value == null) return undefined;
    const n = Number(value);
    return Number.isNaN(n) ? undefined : n;
  })
  @IsNumber()
  rating?: number | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value == null) return undefined;
    const n = Number(value);
    return Number.isNaN(n) ? undefined : n;
  })
  @IsNumber()
  reviews_count?: number | null;

  @IsOptional()
  @IsString()
  search_term?: string | null;

  @IsOptional()
  @IsString()
  brand?: string | null;
}

export class SaveTikTokProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TikTokProduct)
  products: TikTokProduct[];
}
