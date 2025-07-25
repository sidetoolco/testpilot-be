import { Injectable } from '@nestjs/common';
import { TableName } from 'lib/enums';
import { SupabaseService } from 'supabase/supabase.service';

@Injectable()
export class UsersService {
  constructor(private readonly supabaseService: SupabaseService) {}

  public async getUserCompanyId(userId: string): Promise<string> {
    const { company_id: companyId } = await this.supabaseService.getById<{
      company_id: string;
    }>({
      tableName: TableName.PROFILES,
      selectQuery: 'company_id',
      single: true,
      id: userId,
    });

    return companyId;
  }

  public async getUserRole(userId: string): Promise<string> {
    const { role } = await this.supabaseService.getById<{
      role: string;
    }>({
      tableName: TableName.PROFILES,
      selectQuery: 'role',
      single: true,
      id: userId,
    });

    return role;
  }
}
