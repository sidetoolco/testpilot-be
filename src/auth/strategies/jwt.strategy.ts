import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { AuthService } from 'auth/auth.service';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get('SUPABASE_JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    try {
      // Verify the user token with Supabase
      const user = await this.authService.validateUser(payload);

      if (!user) {
        throw new Error('User not found');
      }

      return user;
    } catch (error) {
      throw new UnauthorizedException();
    }
  }
}
