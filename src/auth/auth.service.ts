import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'supabase/supabase.service';

@Injectable()
export class AuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  public async validateUser(token: string) {
    try {
      const user = await this.supabaseService.getUser(token);

      return user;
    } catch (err) {
      return null;
    }
  }
}
