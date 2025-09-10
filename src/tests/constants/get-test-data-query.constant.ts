export const GET_TEST_DATA_QUERY = `
          id,
          name,
          status,
          search_term,
          created_at,
          updated_at,
          block,
          competitors:test_competitors(
            product:amazon_products(id, title, image_url, price)
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
            tester_id(
              variation_type,
              id,
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
          )
        `;
