import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { UsersService } from 'users/users.service';
import { ADMIN_ROLES, UserRole } from 'lib/enums';

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.id) {
      this.logger.warn('Admin access denied: No user found in request');
      throw new ForbiddenException('Admin access required');
    }

    try {
      const userRole = await this.usersService.getUserRole(user.id);
      
      if (!userRole) {
        this.logger.warn(`Admin access denied: No role found for user ${user.id}`);
        throw new ForbiddenException('Admin access required');
      }

      const hasAdminAccess = ADMIN_ROLES.includes(userRole as UserRole.ADMIN);
      
      if (hasAdminAccess) {
        this.logger.log(`Admin access granted to user ${user.id} with admin role`);
        return true;
      } else {
        this.logger.warn(`Admin access denied: User ${user.id} has role ${userRole} (admin role required)`);
        throw new ForbiddenException('Admin access required');
      }
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(`Error validating admin access for user ${user.id}:`, error);
      throw new ForbiddenException('Admin access required');
    }
  }
} 