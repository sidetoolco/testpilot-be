import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TableName } from 'lib/enums';

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

  public async getById<T>({
    tableName,
    selectQuery = '*',
    id,
  }: {
    tableName: TableName;
    selectQuery?: string;
    id: string;
  }): Promise<T | null> {
    const { data, error } = await this.client
      .from(tableName)
      .select(selectQuery)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;

    return data as T;
  }
}
