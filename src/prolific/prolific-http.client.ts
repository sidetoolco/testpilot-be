import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

@Injectable()
export class ProlificHttpClient {
  private readonly client: AxiosInstance;
  private readonly logger = new Logger(ProlificHttpClient.name);

  constructor(private readonly configService: ConfigService) {
    const prolificToken = this.configService.get('PROLIFIC_API_TOKEN');
    if (!prolificToken) {
      throw new Error('PROLIFIC_API_TOKEN is not defined in environment variables');
    }

    this.client = axios.create({
      baseURL: 'https://api.prolific.com/api/v1',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${prolificToken}`,
      },
      timeout: 10000, // 10 seconds
    });

    this.setupInterceptors();
  }

  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  public async post<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async patch<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }

  private setupInterceptors() {
    this.client.interceptors.request.use(
      (config) => {
        this.logger.debug(`Making request to ${config.url}`);
        return config;
      },
      (error) => {
        this.logger.error('Request error: ', error);
        return Promise.reject(error);
      },
    );

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error('Response error: ', {
          status: error.response?.status,
          data: error.response?.data,
        });

        return Promise.reject(error);
      },
    );
  }
}
