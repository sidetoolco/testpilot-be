import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

@Injectable()
export class AdalineHttpClient {
  private readonly client: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    const adalineToken = this.configService.get('ADALINE_API_TOKEN');

    if (!adalineToken) {
      throw new Error(
        'ADALINE_API_TOKEN is not defined in environment variables',
      );
    }

    this.client = axios.create({
      baseURL: 'https://api.adaline.ai/v1',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adalineToken}`,
      },
      timeout: 10000,
    });
  }

  public async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(path, config);

    return response.data;
  }
}
