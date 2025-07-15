import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpClient } from '../lib/http/base-http.client';

@Injectable()
export class ProlificHttpClient extends BaseHttpClient {
  constructor(private readonly configService: ConfigService) {
    const prolificToken = configService.get('PROLIFIC_API_TOKEN');
    if (!prolificToken) {
      throw new Error('PROLIFIC_API_TOKEN is not defined in environment variables');
    }

    super('https://api.prolific.com/api/v1/', {
      Authorization: `Token ${prolificToken}`,
    });
  }
}
