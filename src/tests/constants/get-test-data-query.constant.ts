export const GET_TEST_DATA_QUERY = `
          id,
          name,
          status,
          search_term,
          created_at,
          updated_at,
          block,
          competitors:test_competitors(
            id, product_id, product_type
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
            products(id, title, image_url, price),
            competitor_id,
            tester_id,
            testers_session!inner(
              variation_type,
              prolific_pid,
              shopper_demographic(id_prolific, age, sex, country_residence)
            )
          )
        `;
