import { TestObjective } from "tests/enums";

export interface RawTestData {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'complete';
  search_term: string;
  created_at: string;
  objective: TestObjective;
  updated_at: string;
  block: boolean;
  competitors: Array<{
    product_type: 'amazon_product' | 'walmart_product' | 'tiktok_product';
    product_id?: string;
    amazon_product?: {
      id: string;
      title: string;
      image_url: string;
      price: number;
    };
    walmart_product?: {
      id: string;
      title: string;
      image_url: string;
      price: number;
    };
    tiktok_product?: {
      id: string;
      title: string;
      image_url: string;
      price: number;
    };
  }>;
  variations: Array<{
    product: {
      id: string;
      title: string;
      image_url: string;
      price: number;
    };
    variation_type: 'a' | 'b' | 'c';
    prolific_status: string | null;
  }>;
  demographics: Array<{
    age_ranges: string[];
    genders: string[];
    locations: string[];
    interests: string[];
    tester_count: number;
  }>;
  responses_surveys: Array<{
    improve_suggestions: string;
    likes_most: string;
    appetizing?: number | null;
    target_audience?: number | null;
    novelty?: number | null;
    products: {
      id: string;
      title: string;
      image_url: string;
      price: number;
    };
    tester_id: string;
    testers_session: {
      variation_type: string;
      prolific_pid: string;
      shopper_demographic: {
        id_prolific: string;
        age: number;
        sex: string;
        country_residence: string;
      };
    };
  }>;
  responses_comparisons: Array<{
    improve_suggestions: string;
    likes_most: string;
    choose_reason: string;
    appetizing?: number | null;
    target_audience?: number | null;
    novelty?: number | null;
    products: {
      id: string;
      title: string;
      image_url: string;
      price: number;
    };
    competitor_id: string;
    tester_id: string;
    testers_session: {
      variation_type: string;
      prolific_pid: string;
      shopper_demographic: {
        id_prolific: string;
        age: number;
        sex: string;
        country_residence: string;
      };
    };
  }>;
  responses_comparisons_walmart: Array<{
    improve_suggestions: string;
    likes_most: string;
    choose_reason: string;
    appetizing?: number | null;
    target_audience?: number | null;
    novelty?: number | null;
    products: {
      id: string;
      title: string;
      image_url: string;
      price: number;
    };
    walmart_products: {
      id: string;
      title: string;
      image_url: string;
      price: number;
    };
    tester_id: {
      variation_type: string;
      id: string;
      prolific_pid: string;
      shopper_demographic: {
        id_prolific: string;
        age: number;
        sex: string;
        country_residence: string;
      };
    };
  }>;
  responses_comparisons_tiktok: Array<{
    improve_suggestions: string;
    likes_most: string;
    choose_reason: string;
    appetizing?: number | null;
    target_audience?: number | null;
    novelty?: number | null;
    products: {
      id: string;
      title: string;
      image_url: string;
      price: number;
    };
    tester_id: {
      variation_type: string;
      id: string;
      prolific_pid: string;
      shopper_demographic: {
        id_prolific: string;
        age: number;
        sex: string;
        country_residence: string;
      };
    };
  }>;
}

export interface TestData {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'complete';
  objective: string;
  searchTerm: string;
  block: boolean;
  competitors: Array<Product>;
  variations: {
    a: ProductWithProlificStatus | null;
    b: ProductWithProlificStatus | null;
    c: ProductWithProlificStatus | null;
  };
  demographics: {
    ageRanges: string[];
    gender: string[];
    locations: string[];
    interests: string[];
    testerCount: number;
  };
  completed_sessions: number;
  responses: {
    surveys: Record<string, Survey[]>;
    comparisons: Record<string, Comparison[]>;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  title: string;
  image_url: string;
  price: number;
}

export interface ProductWithProlificStatus extends Product {
  prolificStatus: string | null;
}

export interface Survey {
  improve_suggestions: string;
  likes_most: string;
  products: Product;
  tester_id: TesterInfo;
}

export interface Comparison {
  improve_suggestions: string;
  likes_most: string;
  choose_reason: string;
  products: Product;
  competitor_id: string;
  tester_id: TesterInfo;
}

export interface TesterInfo {
  variation_type: string;
  id: string;
  prolific_pid: string;
  shopper_demographic: {
    id_prolific: string;
    age: number;
    sex: string;
    country_residence: string;
  };
}
