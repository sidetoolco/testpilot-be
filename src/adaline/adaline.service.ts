import { Injectable } from '@nestjs/common';
import { AdalineHttpClient } from './adaline-http.client';
import { PromptDeployment } from './interfaces';
import { TestObjective } from 'tests/enums';

@Injectable()
export class AdalineService {
  constructor(private readonly client: AdalineHttpClient) {}

  public async getPromptDeployment(
    testObjective?: TestObjective,
    promptId?: string,
  ) {
    try {
      if (!promptId) {
        promptId = this.getPromptIdFromTestObjective(testObjective);
      }
      
      return await this.client.get<PromptDeployment>(
        `/deployments/${promptId}/current`,
      );
    } catch (error) {
      console.error(error);
    }
  }

  private getPromptIdFromTestObjective(testObjective: TestObjective) {
    let promptId: string;

    switch (testObjective) {
      case TestObjective.IDEA_SCREENING:
        promptId = '7d36492d-93bd-4dea-a1ce-140961e9b533';
        break;
      case TestObjective.PACKAGE_DESIGN:
        promptId = 'd303d13d-5c17-4f8b-ae77-65ed917d250f';
        break;
      case TestObjective.POSITIONING:
        promptId = '52984cf9-2c77-4b47-8d01-87e272f24dd3';
        break;
      case TestObjective.PRICE_SENSITIVITY:
      default:
        promptId = '4ea68348-1218-4ab0-be95-ad15c48bf05c';
        break;
    }

    return promptId;
  }
}
