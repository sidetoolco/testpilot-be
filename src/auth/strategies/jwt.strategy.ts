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
      passReqToCallback: true, // This allows us to access the request object
    });
  }

  async validate(request: any) {
    try {
      // Get the raw token from the Authorization header
      const token = request.get('authorization').replace('Bearer ', '');

      // Verify the user token with Supabase
      const user = await this.authService.validateUser(token);

      if (!user) {
        throw new Error('User not found');
      }

      // Return the user object with the correct structure
      // Supabase getUser returns { user: { id: string, ... } }
      return {
        id: user.user?.id,
        ...user.user,
        ...user
      };
    } catch (error) {
      throw new UnauthorizedException();
    }
  }
}
