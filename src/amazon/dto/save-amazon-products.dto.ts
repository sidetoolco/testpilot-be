import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';

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
}

export class SaveAmazonProductsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AmazonProduct)
  @ArrayMinSize(11)
  @ArrayMaxSize(11)
  products: AmazonProduct[];
}
