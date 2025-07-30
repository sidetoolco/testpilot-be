import { IsBoolean, IsNotEmpty, IsUUID } from 'class-validator';

export class UpdateTestBlockDto {
  @IsNotEmpty()
  @IsUUID()
  testId: string;

  @IsNotEmpty()
  @IsBoolean()
  block: boolean; // Can be true or false for complete tests
} 