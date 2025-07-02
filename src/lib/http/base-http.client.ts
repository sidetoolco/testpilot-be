import { Injectable } from '@nestjs/common';

interface RequestConfig extends RequestInit {
  params?: Record<string, string>;
}

@Injectable()
export abstract class BaseHttpClient {
  protected readonly baseUrl: string;
  protected readonly headers: Record<string, string>;

  constructor(
    baseUrl: string,
    headers: Record<string, string> = {},
  ) {
    this.baseUrl = baseUrl;
    this.headers = {
      'Content-Type': 'application/json',
      ...headers,
    };
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const url = new URL(cleanPath, this.baseUrl);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    return url.toString();
  }

  public async get<T>(path: string, config?: RequestConfig): Promise<T> {
    const url = this.buildUrl(path, config?.params);
    const response = await fetch(url, {
      ...config,
      method: 'GET',
      headers: { ...this.headers, ...config?.headers },
    });
    
    if (!response.ok) {
      const errorData = await this.getErrorData(response);
      throw new Error(errorData);
    }
    
    return response.json();
  }

  public async post<T>(
    path: string,
    data?: any,
    config?: RequestConfig,
  ): Promise<T> {
    const url = this.buildUrl(path, config?.params);
    const response = await fetch(url, {
      ...config,
      method: 'POST',
      headers: { ...this.headers, ...config?.headers },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const errorData = await this.getErrorData(response);
      throw new Error(errorData);
    }
    
    return response.json();
  }

  public async put<T>(
    path: string,
    data?: any,
    config?: RequestConfig,
  ): Promise<T> {
    const url = this.buildUrl(path, config?.params);
    const response = await fetch(url, {
      ...config,
      method: 'PUT',
      headers: { ...this.headers, ...config?.headers },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const errorData = await this.getErrorData(response);
      throw new Error(errorData);
    }
    
    return response.json();
  }

  public async patch<T>(
    path: string,
    data?: any,
    config?: RequestConfig,
  ): Promise<T> {
    const url = this.buildUrl(path, config?.params);
    const response = await fetch(url, {
      ...config,
      method: 'PATCH',
      headers: { ...this.headers, ...config?.headers },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const errorData = await this.getErrorData(response);
      throw new Error(errorData);
    }
    
    return response.json();
  }

  public async delete<T>(path: string, config?: RequestConfig): Promise<T> {
    const url = this.buildUrl(path, config?.params);
    const response = await fetch(url, {
      ...config,
      method: 'DELETE',
      headers: { ...this.headers, ...config?.headers },
    });
    
    if (!response.ok) {
      const errorData = await this.getErrorData(response);
      throw new Error(errorData);
    }
    
    return response.json();
  }

  private async getErrorData(response: Response): Promise<string> {
    try {
      const data = await response.json();

      return JSON.stringify(data) || `HTTP error! status: ${response.status}`;
    } catch {
      return `HTTP error! status: ${response.status}`;
    }
  }
}
