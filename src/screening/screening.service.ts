import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { OpenAiService } from 'open-ai/open-ai.service';

@Injectable()
export class ScreeningService {
  constructor(private readonly openAiService: OpenAiService) {}

  async validateScreeningQuestion(question: string) {
    // First check: Ensure the input is a question and is a yes/no question
    const trimmed = question.trim();
    if (!trimmed.endsWith('?')) {
      return {
        isValid: false,
        error:
          'The input is not a question. Please enter a valid yes/no screening question.',
      };
    }

    // Optional heuristic: Check for yes/no format (can be adjusted)
    const yesNoIndicators = [
      'Do you',
      'Have you',
      'Are you',
      'Can you',
      'Would you',
    ];
    const isYesNo = yesNoIndicators.some((prefix) =>
      trimmed.toLowerCase().startsWith(prefix.toLowerCase()),
    );
    if (!isYesNo) {
      return {
        isValid: false,
        error: 'The question must be answerable with a "yes" or "no".',
      };
    }

    const prompt = `
        Analyze the following yes/no demographic screening question and determine if it is likely to exclude more than 90% of the U.S. population (i.e., if fewer than 10% would answer “yes”).
        Your goal is to determine if the question is valid for general recruitment.
        If fewer than 10% of the U.S. population would likely answer “yes,” return:
            {
                "isValid": false,
                "error": "This question is too restrictive."
            }
        If 10% or more of the U.S. population would likely answer “yes,” return:
            {
                "isValid": true
            }
        Question: “${question}”
    `;

    const response = await this.openAiService.createChatCompletion([
      {
        role: 'system',
        content:
          'You are an expert in user research and participant screening. Your task is to analyze screening questions and determine if they might be too restrictive.',
      },
      { role: 'user', content: prompt },
    ]);

    try {
      return JSON.parse(response);
    } catch (err) {
      throw new InternalServerErrorException(
        'Failed to parse response from language model. Please try again or contact support.',
      );
    }
  }
}
