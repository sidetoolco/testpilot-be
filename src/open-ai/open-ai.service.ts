import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
  private client: OpenAI;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('OPEN_AI_API_KEY');

    if (!apiKey) {
      this.logger.error('OPEN_AI_API_KEY is not defined in env variables');
      throw new Error('OPEN_AI_API_KEY is required');
    }

    this.client = new OpenAI({
      apiKey,
    });

    this.logger.log('OpenAI service initialized');
  }

  public async createChatCompletion(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    options: {
      model?: string;
    } = {},
  ) {
    const { model = 'o3-mini' } = options;

    try {
      const { choices } = await this.client.chat.completions.create({
        model,
        messages,
      });

      return choices[0].message.content;
    } catch (error) {
      throw error;
    }
  }
}
