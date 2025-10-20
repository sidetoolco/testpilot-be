import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsString,
  IsUrl,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Review } from '../interfaces/product-detail.interface';

export class AmazonProduct {
  @IsString()
  asin: string;

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

  @IsOptional()
  @IsArray()
  reviews?: Review[];
}

export class SaveAmazonProductsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AmazonProduct)
  @ArrayMinSize(11)
  @ArrayMaxSize(11)
  products: AmazonProduct[];
}
