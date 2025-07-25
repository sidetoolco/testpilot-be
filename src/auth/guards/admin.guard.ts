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
    const { user } = request.user;

    try {
      const userRole = await this.usersService.getUserRole(user.id);

      if (!userRole || (userRole !== 'admin' && userRole !== 'owner')) {
        this.logger.warn(`User ${user.id} attempted admin access with role: ${userRole}`);
        throw new ForbiddenException('Admin access required');
      }

      return true;
    } catch (error) {
      this.logger.error(`Error validating admin access for user ${user.id}:`, error);
      throw new ForbiddenException('Admin access required');
    }
  }
} 