import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpClient } from '../lib/http/base-http.client';

@Injectable()
export class AdalineHttpClient extends BaseHttpClient {
  constructor(private readonly configService: ConfigService) {
    const adalineToken = configService.get('ADALINE_API_TOKEN');

    if (!adalineToken) {
      throw new Error(
        'ADALINE_API_TOKEN is not defined in environment variables',
      );
    }

    super('https://api.adaline.ai/v1/', {
      Authorization: `Bearer ${adalineToken}`,
    });
  }
}
