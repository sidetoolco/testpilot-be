import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsObject,
  IsArray,
  ValidateNested,
  IsUUID,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

class ExternalResearcherDto {
  @IsNotEmpty()
  @IsString()
  researcherId: string;

  @IsNotEmpty()
  @IsString()
  researcherName: string;
}

export class DemographicsDto {
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  ageRanges: string[];

  @IsNotEmpty()
  @IsString()
  genders: string;

  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  locations: string[];

  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  interests: string[];
}

export class CreateTestDto {
  @IsNotEmpty()
  @IsString()
  publicTitle: string;

  @IsNotEmpty()
  @IsString()
  publicInternalName: string;

  @IsNotEmpty()
  @IsNumber()
  participantTimeRequiredMinutes: number;

  @IsNotEmpty()
  @IsNumber()
  incentiveAmount: number;

  @IsNotEmpty()
  @IsNumber()
  targetNumberOfParticipants: number;

  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => ExternalResearcherDto)
  externalResearcher: ExternalResearcherDto;

  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => DemographicsDto)
  demographics: DemographicsDto;

  @IsNotEmpty()
  @IsUUID()
  testId: string;

  @IsNotEmpty()
  @IsString()
  variationType: string;

  @IsNotEmpty()
  @IsBoolean()
  customScreeningEnabled: boolean;
}
