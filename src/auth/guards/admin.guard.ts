import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { UsersService } from 'users/users.service';

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    try {
      // For now, allow all authenticated users to access admin endpoints
      // TODO: Implement proper role checking when user roles are properly set up
      this.logger.log(`Admin access granted to user ${user.id}`);
      return true;
    } catch (error) {
      this.logger.error(`Error validating admin access for user ${user?.id}:`, error);
      throw new ForbiddenException('Admin access required');
    }
  }
} 