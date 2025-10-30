import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';

export class WalmartProduct {
  @IsOptional()
  @IsString()
  id?: string; // Use Walmart ID as id for this table

  @IsOptional()
  @IsString()
  walmart_id?: string; // Walmart product ID (like "105XZBDBG2G0")

  @Type(() => Number)
  @IsNumber()
  price: number;

  @IsString()
  image_url: string;

  @IsString()
  product_url: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  rating?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  reviews_count?: number | null;

  @IsOptional()
  @IsString()
  search_term?: string | null;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  brand?: string | null;
}

export class SaveWalmartProductsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WalmartProduct)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  products: WalmartProduct[];
}
