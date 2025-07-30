

-- SCRIPT GENERADO PARA SUPABASE WEB

-- Tabla: amazon_products
CREATE TABLE public.amazon_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    price numeric(10,2) NOT NULL,
    rating numeric(2,1),
    reviews_count integer,
    image_url text NOT NULL,
    product_url text,
    search_term text NOT NULL,
    company_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    asin text,
    bullet_points text[],
    images text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT amazon_products_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT amazon_products_rating_check CHECK (((rating >= (0)::numeric) AND (rating <= (5)::numeric)))
);
COMMENT ON TABLE public.amazon_products IS 'products scraped from amazon in searches';

-- Tabla: companies
CREATE TABLE public.companies (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo_url text,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    waiting_list boolean DEFAULT false NOT NULL
);

CREATE TYPE public.variant AS ENUM ('a', 'b', 'c');

-- Tabla: competitive_insights
CREATE TABLE public.competitive_insights (
    id bigint NOT NULL,
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


-- Tabla: feedback
CREATE TABLE public.feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    rating bigint NOT NULL,
    comment text NOT NULL
);


-- Tabla: ia_insights
CREATE TABLE public.ia_insights (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    test_id uuid DEFAULT gen_random_uuid(),
    comparison_between_variants text DEFAULT 'NULL'::text,
    purchase_drivers text,
    competitive_insights text,
    recommendations text,
    "sendEmail" boolean
);


-- Tabla: insight_status
CREATE TABLE public.insight_status (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    insight_data text,
    variant_type public.variant,
    test_id uuid
);


-- Tabla: products
CREATE TABLE public.products (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    description text,
    price numeric NOT NULL,
    image_url text,
    images text[],
    rating numeric,
    is_competitor boolean DEFAULT false,
    loads integer,
    product_url text,
    company_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    reviews_count integer DEFAULT 0 NOT NULL,
    bullet_points text[],
    brand text,
    CONSTRAINT loads_positive CHECK (((loads IS NULL) OR (loads >= 0))),
    CONSTRAINT products_rating_check CHECK (((rating >= (0)::numeric) AND (rating <= (5)::numeric))),
    CONSTRAINT products_review_count_check1 CHECK ((reviews_count >= 0))
);
COMMENT ON TABLE public.products IS 'Products from the user';

-- Tabla: profiles
CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    avatar_url text,
    company_id uuid,
    role text,
    company_joined_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    email_confirmed boolean DEFAULT false NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])))
);


-- Tabla: purchase_drivers
CREATE TABLE public.purchase_drivers (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    appearance numeric,
    confidence numeric,
    convenience numeric,
    brand numeric,
    value numeric,
    test_id uuid,
    variant_type public.variant,
    count numeric,
    product_id uuid
);


-- Tabla: responses_comparisons
CREATE TABLE public.responses_comparisons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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
    tester_id uuid
);


-- Tabla: responses_surveys
CREATE TABLE public.responses_surveys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tester_id uuid NOT NULL,
    product_id uuid,
    test_id uuid,
    value numeric,
    appearance numeric,
    confidence numeric,
    brand numeric,
    convenience numeric,
    likes_most text,
    improve_suggestions text
);
COMMENT ON TABLE public.responses_surveys IS 'When testers select our product';

-- Tabla: shopper_demographic
CREATE TABLE public.shopper_demographic (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    age numeric,
    sex text,
    ethnicity text,
    country_birth text,
    country_residence text,
    nationality text,
    student text,
    employment_status text,
    language text,
    id_prolific text,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


-- Tabla: summary
CREATE TABLE public.summary (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    test_id uuid DEFAULT gen_random_uuid() NOT NULL,
    variant_type public.variant,
    share_of_buy numeric,
    share_of_click numeric,
    value_score numeric,
    win boolean,
    product_id uuid
);


-- Tabla: test_competitors
CREATE TABLE public.test_competitors (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    test_id uuid
);


-- Tabla: test_demographics
CREATE TABLE public.test_demographics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    age_ranges text[] DEFAULT '{}'::text[] NOT NULL,
    genders text[] DEFAULT '{}'::text[] NOT NULL,
    locations text[] DEFAULT '{}'::text[] NOT NULL,
    interests text[] DEFAULT '{}'::text[] NOT NULL,
    tester_count integer DEFAULT 10 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Tabla: test_times
CREATE TABLE public.test_times (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    testers_session uuid DEFAULT gen_random_uuid(),
    product_id uuid,
    time_spent numeric NOT NULL,
    click numeric DEFAULT '0'::numeric NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    competitor_id uuid
);
COMMENT ON TABLE public.test_times IS 'Time each shopper spend in each product';

-- Tabla: test_variations
CREATE TABLE public.test_variations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variation_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    prolific_status text,
    prolific_test_id text,
    CONSTRAINT test_variations_variation_type_check CHECK ((variation_type = ANY (ARRAY['a'::text, 'b'::text, 'c'::text])))
);


-- Tabla: testers_session
CREATE TABLE public.testers_session (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    test_id uuid DEFAULT gen_random_uuid(),
    status text DEFAULT 'introduction'::text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    ended_at timestamp with time zone,
    competitor_id uuid,
    variation_type text,
    prolific_pid text
);
COMMENT ON TABLE public.testers_session IS 'Shopper sessions';

CREATE TYPE public.test_objective AS ENUM (
    'price_sensitivity',
    'package_design',
    'positioning',
    'idea_screening'
);
-- Tabla: tests
CREATE TABLE public.tests (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    status text NOT NULL,
    search_term text NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    complete_email boolean DEFAULT false,
    objective public.test_objective,
    block boolean DEFAULT false,
    CONSTRAINT tests_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'complete'::text, 'needs review'::text])))
);
COMMENT ON COLUMN public.tests.block IS 'Controls whether the test is blocked. Only relevant for tests with complete status. Initially set to true when test becomes complete, but admins can change it to true or false.';
