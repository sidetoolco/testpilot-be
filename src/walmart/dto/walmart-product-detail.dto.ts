import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class WalmartOffer {
  @IsString()
  url: string;
  
  @IsString()
  availability: string;
  
  @IsOptional()
  @IsString()
  available_delivery_method?: string;
  
  @IsOptional()
  @IsString()
  item_condition?: string;
}

export class WalmartProductDetail {
  @IsString()
  product_name: string;

  @IsOptional()
  @IsString()
  product_description?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WalmartOffer)
  offers?: WalmartOffer[];

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  mpn?: string;

  @IsOptional()
  @IsString()
  gtin?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @IsOptional()
  @IsString()
  availability_status?: string;

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @IsString()
  seller_name?: string;

  @IsOptional()
  @IsString()
  seller_rating?: string;

  @IsOptional()
  @IsNumber()
  seller_review_count?: number;

  @IsOptional()
  @IsString()
  shipping_info?: string;

  @IsOptional()
  @IsString()
  return_policy?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specifications?: string[];
}
