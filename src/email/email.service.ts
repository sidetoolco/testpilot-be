import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get('RESEND_API_KEY');

    if (!apiKey) {
      throw new Error('RESEND_API_KEY is required');
    }

    this.resend = new Resend(apiKey);
  }

  public async sendTestCompletionReminder(studyId: string, testId: string) {
    try {
      await this.resend.emails.send({
        from: 'TestPilot <notifications@testpilotcpg.com>',
        to: ['allan@testpilotcpg.com', 'kristina@testpilotcpg.com'],
        subject: 'Test Completion Reminder',
        html: `
                <h2>Test Completion Reminder</h2>
                <p>A test has not been completed after 72 hours.</p>
                <p><strong>Prolific study ID:</strong> ${studyId}</p>
                <p><strong>TestPilot test ID:</strong> ${testId}</p>
                <p>Please check the status of this test in the Prolific dashboard.</p>
            `,
      });
      this.logger.log(`Sent completion reminder email for study ${studyId}`);
    } catch (error) {
      this.logger.error(
        `Failed to send completion reminder email for study ${studyId}:`,
        error,
      );
      throw error;
    }
  }

  public async sendCompanyInvitation(inviteeEmail: string, token: string) {
    try {
      await this.resend.emails.send({
        from: 'invites@testpilotcpg.com',
        to: inviteeEmail,
        subject: `You've been invited to TestPilot!`,
        html: `
          <h1>You've Been Invited to TestPilot!</h1>
          
          <p>Click the link below to accept the invitation:</p>
          <a href="${this.configService.get('FE_URL')}/accept-invite?token=${token}">Accept Invitation</a>
          
          <p>This invitation link will expire in 7 days.</p>
          
          <p>If you did not expect this invitation, please disregard this email.</p>
        `,
      });
    } catch (error) {
      const errorMsg = `Failed to send company invitation to email ${inviteeEmail}`;
      this.logger.error(`${errorMsg}:`, error);

      throw new InternalServerErrorException(errorMsg);
    }
  }
}
