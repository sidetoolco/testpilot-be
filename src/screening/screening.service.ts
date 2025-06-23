import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AdalineService } from 'adaline/adaline.service';
import { OpenAiService } from 'open-ai/open-ai.service';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { TestObjective } from 'tests/enums';

@Injectable()
export class ScreeningService {
  private readonly logger = new Logger(ScreeningService.name);

  constructor(
    private readonly openAiService: OpenAiService,
    private readonly adalineService: AdalineService,
  ) {}

  async validateScreeningQuestion(
    question: string,
    desiredAnswer: 'Yes' | 'No',
  ) {
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

    const { messages, config } = await this.adalineService.getPromptDeployment(
      null,
      '916af1ba-a49b-41d3-b172-f4d3588bca72',
    );

    const updatedMessages = messages.map((message) => {
      if (message.role === 'user') {
        return {
          ...message,
          content: message.content.map((content) => {
            if (content.modality === 'text') {
              return {
                ...content,
                value: content.value
                  .replace('{question}', question)
                  .replace('{desiredAnswer}', desiredAnswer),
              };
            }
            return content;
          }),
        };
      }
      return message;
    });

    // Transform messages to OpenAI format
    const openAiMessages: ChatCompletionMessageParam[] = updatedMessages.map(
      (message) => ({
        role: message.role as 'system' | 'user' | 'assistant',
        content: message.content.map((content) => content.value).join('\n\n'),
      }),
    );

    const response = await this.openAiService.createChatCompletion(
      openAiMessages,
      { model: config.model },
    );

    try {
      return JSON.parse(response);
    } catch (err) {
      this.logger.error(
        `Failed to parse response ${response} with error ${err}`,
      );
      this.logger;
      throw new InternalServerErrorException(
        'Failed to parse response from language model. Please try again or contact support.',
      );
    }
  }
}
