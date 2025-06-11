import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'auth/guards/auth.guard';
import { CompaniesService } from './companies.service';
import { InviteTeamMemberDto } from './dto';

@Controller('companies')
@UseGuards(JwtAuthGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post('/:companyId/invite')
  inviteTeamMember(
    @Param('companyId') companyId: string,
    @Body() { email }: InviteTeamMemberDto,
  ) {
    return this.companiesService.inviteTeamMember(companyId, email);
  }
}
