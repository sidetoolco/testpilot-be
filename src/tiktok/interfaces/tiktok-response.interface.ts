export interface TikTokSearchResponse {
  success: boolean;
  query: string;
  total_products: number;
  products: TikTokSearchProduct[];
}

export interface TikTokSearchProduct {
  product_id: string;
  title: string;
  image?: {
    url_list?: string[];
    uri?: string;
  };
  product_price_info?: {
    sale_price_decimal?: string;
    currency_symbol?: string;
    currency_name?: string;
  };
  rate_info?: {
    score?: number;
    review_count?: string | number;
  };
  sold_info?: {
    sold_count?: number;
  };
  seller_info?: {
    seller_id?: string;
    shop_name?: string;
    shop_logo?: {
      url_list?: string[];
    };
  };
  seo_url?: {
    canonical_url?: string;
    pdp_url?: string;
  };
}

export interface TikTokProductDetailResponse {
  success: boolean;
  product_info?: TikTokProductInfo;
}

export interface TikTokProductInfo {
  product_base?: {
    product_id?: string;
    title?: string;
    images?: Array<{ url_list?: string[] }>;
    price?: string | number;
    seller_shop?: {
      shop_name?: string;
    };
  };
  product_detail?: {
    product_id?: string;
    title?: string;
    images?: Array<{ url_list?: string[] }>;
    price?: string | number;
  };
  rate_info?: {
    score?: number;
    review_count?: string | number;
  };
  seo_url?: {
    canonical_url?: string;
  };
}

export interface TikTokReviewsResponse {
  success: boolean;
  product_reviews?: TikTokReview[];
  has_more?: boolean;
  total_reviews?: number;
}

export interface TikTokReview {
  review_id?: string;
  rating?: number;
  content?: string;
  create_time?: number;
  reviewer_name?: string;
}
