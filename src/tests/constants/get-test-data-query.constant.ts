export const GET_TEST_DATA_QUERY = `
          id,
          name,
          status,
          search_term,
          created_at,
          updated_at,
          block,
          objective,
          competitors:test_competitors(
            product_type,
            product_id
          ),
          variations:test_variations(
            product:products(id, title, image_url, price),
            variation_type,
            prolific_status
          ),
          demographics:test_demographics(
            age_ranges, genders, locations, interests, tester_count
          ),
          responses_surveys(
            improve_suggestions,
            likes_most,
            appetizing,
            target_audience,
            novelty,
            products(id, title, image_url, price),
            tester_id,
            testers_session!inner(
              variation_type,
              prolific_pid,
              shopper_demographic(id_prolific, age, sex, country_residence)
            )
          ),
          responses_comparisons(
            improve_suggestions,
            likes_most,
            choose_reason,
            appetizing,
            target_audience,
            novelty,
            products(id, title, image_url, price),
            amazon_products(id, title, image_url, price),
            tester_id(
              variation_type,
              id,
              prolific_pid,
              shopper_demographic(id_prolific, age, sex, country_residence)
            )
          ),
          responses_comparisons_walmart(
            improve_suggestions,
            likes_most,
            choose_reason,
            appetizing,
            target_audience,
            novelty,
            products(id, title, image_url, price),
            walmart_products(id, title, image_url, price),
            tester_id(
              variation_type,
              id,
              prolific_pid,
              shopper_demographic(id_prolific, age, sex, country_residence)
            )
          ),
          responses_comparisons_tiktok(
            improve_suggestions,
            likes_most,
            choose_reason,
            appetizing,
            target_audience,
            novelty,
            products(id, title, image_url, price),
            tester_id(
              variation_type,
              id,
              prolific_pid,
              shopper_demographic(id_prolific, age, sex, country_residence)
            )
          )
        `;

/**
 * Query for test sessions with intelligent session type detection
 */
export const GET_TEST_SESSIONS_QUERY = `
  ts.id,
  ts.test_id,
  ts.prolific_pid,
  ts.variation_type,
  ts.status,
  ts.created_at,
  ts.ended_at,
  ts.competitor_id,
  ts.walmart_product_id,
  ts.product_id,
  t.name as test_name,
  CASE 
    WHEN t.name = 'walmart' OR t.name LIKE '%walmart%' THEN 'Walmart Session'
    WHEN t.name = 'amazon' OR t.name LIKE '%amazon%' THEN 'Amazon Session'
    WHEN ts.walmart_product_id IS NOT NULL THEN 'Walmart Session'
    WHEN ts.competitor_id IS NOT NULL THEN 'Amazon Session'
    ELSE 'Unknown Session Type'
  END as session_type
`;
