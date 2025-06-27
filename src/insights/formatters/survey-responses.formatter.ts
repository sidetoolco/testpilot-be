import {
  ResponseComparison,
  ResponseSurvey,
} from 'lib/interfaces/entities.interface';

export const surveyResponsesForSummaryFormatter = (
  surveys: ResponseSurvey[],
  comparisons: ResponseComparison[],
) => {
  const likesMostResponses = surveys
    .filter((response) => response.likes_most?.trim())
    .map(({ likes_most }) => likes_most);

  const improvementsResponses = surveys
    .filter((response) => response.improve_suggestions?.trim())
    .map(({ improve_suggestions }) => improve_suggestions);

  const chooseReasonResponses = comparisons
    .filter((response) => response.choose_reason?.trim())
    .map(({ choose_reason }) => choose_reason);

  return {
    survey_questions: {
      likes_most: {
        question: 'What do you like most about this product?',
        responses: likesMostResponses,
      },
      improvements: {
        question: 'What would make this product even better?',
        responses: improvementsResponses,
      },
      choose_reason: {
        question: 'What would make you choose Item A?',
        responses: chooseReasonResponses,
      },
    },
  };
};
