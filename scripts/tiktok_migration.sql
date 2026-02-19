-- =============================================================================
-- TikTok Shop simulated market – migration script
-- Run in Supabase SQL Editor
-- =============================================================================

-- 1. New table: tiktok_products
CREATE TABLE IF NOT EXISTS public.tiktok_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tiktok_id text NOT NULL,
    title text NOT NULL,
    image_url text,
    product_url text,
    price numeric(10,2) NOT NULL,
    rating numeric(2,1),
    reviews_count integer,
    search_term text,
    brand text,
    company_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tiktok_products_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT tiktok_products_rating_check CHECK (((rating IS NULL) OR ((rating >= (0)::numeric) AND (rating <= (5)::numeric)))),
    UNIQUE (tiktok_id, company_id)
);
COMMENT ON TABLE public.tiktok_products IS 'Products scraped from TikTok Shop searches';

-- 2. New table: responses_comparisons_tiktok  (mirrors responses_comparisons_walmart)
CREATE TABLE IF NOT EXISTS public.responses_comparisons_tiktok (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    test_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    competitor_id uuid NOT NULL,
    value numeric,
    appearance numeric,
    confidence numeric,
    brand numeric,
    convenience numeric,
    likes_most text,
    improve_suggestions text,
    choose_reason text,
    tester_id uuid,
    appetizing numeric,
    target_audience numeric,
    novelty numeric
);
COMMENT ON TABLE public.responses_comparisons_tiktok IS 'Comparison responses for TikTok Shop tests';

-- 3. New table: competitive_insights_tiktok  (mirrors competitive_insights_walmart)
CREATE TABLE IF NOT EXISTS public.competitive_insights_tiktok (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    variant_type public.variant,
    competitor_product_id uuid,
    share_of_buy numeric,
    value numeric,
    aesthetics numeric,
    utility numeric,
    trust numeric,
    convenience numeric,
    test_id uuid,
    count numeric DEFAULT '0'::numeric
);
COMMENT ON TABLE public.competitive_insights_tiktok IS 'Competitive insights for TikTok Shop tests';

-- 4. Foreign keys for responses_comparisons_tiktok (PostgREST requires FKs for joins)
ALTER TABLE public.responses_comparisons_tiktok
  ADD CONSTRAINT responses_comparisons_tiktok_tester_id_fkey
  FOREIGN KEY (tester_id) REFERENCES public.testers_session(id) ON DELETE SET NULL;

-- product_id here is the main test product (not a tiktok_product), so no FK added.

ALTER TABLE public.responses_comparisons_tiktok
  ADD CONSTRAINT responses_comparisons_tiktok_test_id_fkey
  FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;

-- 5. Extend testers_session: add tiktok_product_id
ALTER TABLE public.testers_session
    ADD COLUMN IF NOT EXISTS tiktok_product_id uuid;

-- 6. Extend test_times: add tiktok_product_id
ALTER TABLE public.test_times
    ADD COLUMN IF NOT EXISTS tiktok_product_id uuid;

-- 7. test_competitors.product_type is already text (no enum), so 'tiktok_product' is accepted without change.
--    Verify with: SELECT DISTINCT product_type FROM test_competitors;

-- 8. Patch validate_competitor_product() to also accept tiktok_product type
DROP TRIGGER IF EXISTS validate_competitor_product_trigger ON public.test_competitors;

CREATE OR REPLACE FUNCTION validate_competitor_product()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.product_type = 'tiktok_product' THEN
    IF NOT EXISTS (SELECT 1 FROM public.tiktok_products WHERE id = NEW.product_id) THEN
      RAISE EXCEPTION 'Product ID % does not exist in tiktok_products', NEW.product_id;
    END IF;
  ELSIF NEW.product_type = 'walmart_product' THEN
    IF NOT EXISTS (SELECT 1 FROM public.walmart_products WHERE id = NEW.product_id) THEN
      RAISE EXCEPTION 'Product ID % does not exist in walmart_products', NEW.product_id;
    END IF;
  ELSIF NEW.product_type = 'amazon_product' THEN
    IF NOT EXISTS (SELECT 1 FROM public.amazon_products WHERE id = NEW.product_id) THEN
      RAISE EXCEPTION 'Product ID % does not exist in amazon_products', NEW.product_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_competitor_product_trigger
BEFORE INSERT OR UPDATE ON public.test_competitors
FOR EACH ROW EXECUTE FUNCTION validate_competitor_product();

-- Done.
