import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreditsService } from './credits.service';
import { UsersService } from 'users/users.service';
import { CurrentUser } from 'auth/decorators';
import { JwtAuthGuard } from 'auth/guards/auth.guard';

@Controller('credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(
    private readonly creditsService: CreditsService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async getCompanyCreditsData(
    @CurrentUser('id') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    const pageNum = +page;
    const limitNum = +limit;

    if (pageNum < 1 || limitNum < 1) {
      throw new BadRequestException('Page and limit must be positive numbers');
    }

    const companyId = await this.usersService.getUserCompanyId(userId);

    if (!companyId) {
      throw new BadRequestException('Company not found');
    }

    return await this.creditsService.getCompanyCreditsData(
      companyId,
      pageNum,
      limitNum,
    );
  }
}
