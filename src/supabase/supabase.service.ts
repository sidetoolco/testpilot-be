import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Rpc, TableName } from 'lib/enums';
import { MatchCondition } from './interfaces';

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
    single = true,
    additionalConditions = [],
  }: {
    tableName: TableName;
    selectQuery?: string;
    condition: string;
    value: any;
    single?: boolean;
    additionalConditions?: MatchCondition<T>[];
  }): Promise<T | null> {
    let query = this.client.from(tableName).select(selectQuery);

    if (Array.isArray(value)) {
      query = query.in(condition, value);
    } else {
      query = query.eq(condition, value);
    }

    for (const additionalCondition of additionalConditions) {
      query = query.eq(
        String(additionalCondition.key),
        additionalCondition.value,
      );
    }

    const { data, error } = await (single ? query.maybeSingle() : query);

    if (error) throw error;

    return data as T;
  }

  public async getById<T>({
    tableName,
    selectQuery = '*',
    id,
    single = true,
  }: {
    tableName: TableName;
    selectQuery?: string;
    id: string | string[];
    single?: boolean;
  }): Promise<T | null> {
    const result = await this.getByCondition<T>({
      tableName,
      selectQuery,
      condition: 'id',
      value: id,
      single,
    });

    return result as T | null;
  }

  public async rpc<T>(
    functionName: Rpc,
    params?: Record<string, any>,
  ): Promise<T> {
    const { data, error } = await this.client.rpc(functionName, params);

    if (error) throw error;

    return data;
  }

  public async update<T>(
    tableName: TableName,
    payload: Partial<T>,
    matchConditions: MatchCondition<T>[],
    returnValue = true,
  ): Promise<T> {
    let query;

    query = this.client.from(tableName).update(payload);

    // Apply all matching conditions
    for (const condition of matchConditions) {
      query = query.eq(String(condition.key), condition.value);
    }

    query = query.select();

    if (returnValue) {
      query = query.single();
    }

    const { data, error } = await query;

    if (error) throw error;

    return data;
  }

  public async insert<T>(tableName: TableName, dto: object): Promise<T[]> {
    const { error, data } = await this.client
      .from(tableName)
      .insert(dto)
      .select();

    if (error) throw error;

    return data;
  }

  public async upsert<T>(
    tableName: TableName,
    dto: Partial<T>,
    onConflictField: string,
  ) {
    const { error, data } = await this.client
      .from(tableName)
      .upsert(dto, { onConflict: onConflictField })
      .select();

    if (error) throw error;

    return data;
  }

  public async findOne<T>(
    tableName: TableName,
    conditions: Record<string, any>,
    select = '*'
  ): Promise<T | null> {
    let query = this.client.from(tableName).select('*');

    for (const [key, value] of Object.entries(conditions)) {
      query = query.eq(key, value);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw error;

    return data as T | null;
  }

  public async findMany<T>(
    tableName: TableName,
    conditions: Record<string, any>,
    selectQuery?: string,
  ): Promise<T[]> {
    let query = this.client.from(tableName).select(selectQuery || '*');

    for (const [key, value] of Object.entries(conditions)) {
      query = query.eq(key, value);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data as T[];
  }

  public async delete(tableName: TableName, conditions: object) {
    let query = this.client.from(tableName).delete();

    Object.entries(conditions).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        query = query.in(key, value);
      } else {
        query = query.eq(key, value);
      }
    });

    const { error } = await query;

    if (error) throw error;
  }
}
