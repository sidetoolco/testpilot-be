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
  id?: string; // Database UUID (optional for new products)

  @IsOptional()
  @IsString()
  walmart_id?: string; // Walmart product ID (like "105XZBDBG2G0")

  @IsNumber()
  price: number;

  @IsString()
  image_url: string;

  @IsString()
  product_url: string;

  @IsNumber()
  rating: number;

  @IsNumber()
  reviews_count: number;

  @IsString()
  search_term: string;

  @IsString()
  title: string;
}

export class SaveWalmartProductsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WalmartProduct)
  @ArrayMinSize(11)
  @ArrayMaxSize(11)
  products: WalmartProduct[];
}
