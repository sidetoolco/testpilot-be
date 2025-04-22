import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'supabase/supabase.service';

@Injectable()
export class AuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  public async validateUser(payload: any) {
    try {
      const user = await this.supabaseService.getUser(payload.sub);

      return user;
    } catch (err) {
      return null;
    }
  }
}
