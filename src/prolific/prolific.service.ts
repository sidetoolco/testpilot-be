import { Injectable, Logger } from '@nestjs/common';
import { ProlificHttpClient } from './prolific-http.client';
import { ProlificStudy, ProlificStudySubmission } from './interfaces';
import { StudyStatus } from './types';

@Injectable()
export class ProlificService {
  private readonly logger = new Logger(ProlificService.name);

  constructor(private readonly httpClient: ProlificHttpClient) {}

  public async getStudy(studyId: string) {
    try {
      return await this.httpClient.get<ProlificStudy>(`/studies/${studyId}`);
    } catch (error) {
      this.logger.error(`Failed to get study ${studyId}:`, error);
      throw error;
    }
  }

  public async getStudyDemographics(studyId: string) {
    try {
      const demographics = await this.httpClient.get<string>(
        `/studies/${studyId}/export`,
      );

      return this.formatStudyDemographics(demographics);
    } catch (error) {
      this.logger.error(`Failed to get study ${studyId} demographics:`, error);
      throw error;
    }
  }

  public async getStudySubmissions(studyId: string, onlyInvalid = false) {
    try {
      const { results } = await this.httpClient.get<ProlificStudySubmission>(
        `/submissions/?study=${studyId}`,
      );

      return onlyInvalid
        ? results.filter(({ status }) => status !== 'APPROVED')
        : results;
    } catch (error) {
      this.logger.error(`Failed to get study ${studyId} submissions: ${error}`);
      throw error;
    }
  }

  public formatStatus(status: StudyStatus) {
    let formattedStatus: string;

    switch (status) {
      case 'UNPUBLISHED':
        formattedStatus = 'draft';
        break;
      case 'COMPLETED':
        formattedStatus = 'complete';
        break;
      case 'AWAITING REVIEW':
        formattedStatus = 'needs review';
        break;
      case 'ACTIVE':
        formattedStatus = 'active';
        break;
      default:
        formattedStatus = status;
    }

    return formattedStatus;
  }

  private formatStudyDemographics(unformattedDemographics: string) {
    const lines = unformattedDemographics
      .split('\n')
      .filter((line) => line.trim() !== '');
    const headers = lines[0].split(',');

    const formattedDemographics = lines.slice(1).map((line) => {
      const values = line.split(',');
      let obj = {};
      headers.forEach((header, index) => {
        obj[header.trim()] = values[index] ? values[index].trim() : null;
      });
      return obj;
    });

    return formattedDemographics;
  }
}
