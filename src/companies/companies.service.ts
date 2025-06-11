import {
  HttpStatus,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { TableName } from 'lib/enums';
import { SupabaseService } from 'supabase/supabase.service';
import { randomBytes } from 'crypto';
import { Invite } from 'lib/interfaces/entities.interface';
import { EmailService } from 'email/email.service';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly emailService: EmailService,
  ) {}

  public async inviteTeamMember(companyId: string, teamMemberEmail: string) {
    const invitationToken = await this.createInvitation(
      companyId,
      teamMemberEmail,
    );

    await this.emailService.sendCompanyInvitation(
      teamMemberEmail,
      invitationToken,
    );

    return HttpStatus.OK;
  }

  private async createInvitation(companyId: string, inviteeEmail: string) {
    try {
      const token = randomBytes(32).toString('hex');

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await this.supabaseService.insert<Invite>(TableName.COMPANY_INVITES, {
        email: inviteeEmail,
        company_id: companyId,
        token: randomBytes(32).toString('hex'),
        expires_at: expiresAt.toISOString(),
      });

      return token;
    } catch (error) {
      throw new InternalServerErrorException('Failed to create invitation');
    }
  }
}
