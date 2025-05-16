import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

@Injectable()
export abstract class BaseHttpClient {
  protected readonly client: AxiosInstance;

  constructor(
    protected readonly baseUrl: string,
    protected readonly headers: Record<string, string> = {},
  ) {
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      timeout: 10000,
    });
  }

  public async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(path, config);
    return response.data;
  }

  public async post<T>(
    path: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.post<T>(path, data, config);
    return response.data;
  }

  public async put<T>(
    path: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.put<T>(path, data, config);
    return response.data;
  }

  public async patch<T>(
    path: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.patch<T>(path, data, config);
    return response.data;
  }

  public async delete<T>(
    path: string,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.delete<T>(path, config);
    return response.data;
  }
}
