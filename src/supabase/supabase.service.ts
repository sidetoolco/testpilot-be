import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Rpc, TableName } from 'lib/enums';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    this.client = createClient(
      this.configService.get('SUPABASE_URL'),
      this.configService.get('SUPABASE_KEY'),
    );
  }

  public async getUser(token: string) {
    const { data: user, error } = await this.client.auth.getUser(token);

    if (error || !user) throw error;

    return user;
  }

  public async getByCondition<T>({
    tableName,
    selectQuery = '*',
    condition,
    value,
    single = true
  }: {
    tableName: TableName;
    selectQuery?: string;
    condition: string;
    value: any;
    single?: boolean;
  }): Promise<T | null> {
    let query = this.client
      .from(tableName)
      .select(selectQuery)
      .eq(condition, value);

    const { data, error } = await (single ? query.maybeSingle() : query);

    if (error) throw error;

    return data as T;
  }

  public async getById<T>({
    tableName,
    selectQuery = '*',
    id,
  }: {
    tableName: TableName;
    selectQuery?: string;
    id: string;
  }): Promise<T | null> {
    const result = await this.getByCondition<T>({
      tableName,
      selectQuery,
      condition: 'id',
      value: id,
      single: true
    });
    
    return result as T | null;
  }

  public async rpc(functionName: Rpc, params?: Record<string, any>) {
    const { data, error } = await this.client.rpc(functionName, params);

    if (error) throw error;

    return data;
  }
}
