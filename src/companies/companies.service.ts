import {
  ConflictException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { TableName } from 'lib/enums';
import { SupabaseService } from 'supabase/supabase.service';
import { randomBytes } from 'crypto';
import { Invite } from 'lib/interfaces/entities.interface';
import { EmailService } from 'email/email.service';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly emailService: EmailService,
  ) {}

  public async inviteTeamMember(companyId: string, teamMemberEmail: string) {
    // Check if profile already exists
    const existingProfile = await this.supabaseService.getByCondition({
      tableName: TableName.PROFILES,
      condition: 'email',
      value: teamMemberEmail,
      single: true,
    });

    if (existingProfile) {
      throw new ConflictException('A user with this email already exists');
    }
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
      this.logger.error(error);
      
      if (error.code === '23505') {
        throw new ConflictException(
          'An invitation for this email already exists',
        );
      }
      throw new InternalServerErrorException('Failed to create invitation');
    }
  }
}
