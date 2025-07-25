import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreditsService } from './credits.service';
import { UsersService } from 'users/users.service';
import { CurrentUser } from 'auth/decorators';
import { JwtAuthGuard, AdminGuard } from 'auth/guards';
import { AddCreditsDto } from './dto';

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
    const pageNum = Number(page);
    const limitNum = Number(limit);

    if (!Number.isInteger(pageNum) || !Number.isInteger(limitNum) || pageNum < 1 || limitNum < 1) {
      throw new BadRequestException('Page and limit must be positive integers');
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

  @Get('company/:companyId')
  @UseGuards(AdminGuard)
  async getCompanyCreditsDataById(
    @Param('companyId') companyId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    const pageNum = Number(page);
    const limitNum = Number(limit);

    if (!Number.isInteger(pageNum) || !Number.isInteger(limitNum) || pageNum < 1 || limitNum < 1) {
      throw new BadRequestException('Page and limit must be positive integers');
    }

    return await this.creditsService.getCompanyCreditsDataById(
      companyId,
      pageNum,
      limitNum,
    );
  }

  @Post('admin/add')
  @UseGuards(AdminGuard)
  async addCreditsToCompany(@Body() addCreditsDto: AddCreditsDto) {
    return await this.creditsService.addCreditsToCompany(
      addCreditsDto.company_id,
      addCreditsDto.credits,
      addCreditsDto.description,
    );
  }
}
