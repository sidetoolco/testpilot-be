import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { UsersService } from 'users/users.service';

@Injectable()
export class CompanyGuard implements CanActivate {
  private readonly logger = new Logger(CompanyGuard.name);

  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { user } = request.user;

    try {
      const companyId = await this.usersService.getUserCompanyId(user.id);

      if (!companyId) {
        this.logger.warn(`User ${user.id} has no associated company`);
        throw new ForbiddenException('User has no associated company');
      }

      request.companyId = companyId;

      return true;
    } catch (error) {
      this.logger.error(`Error getting company ID for user ${user.id}:`, error);
      throw new ForbiddenException('Error validating company access');
    }
  }
}
