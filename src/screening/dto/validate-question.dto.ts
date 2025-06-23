import { IsNotEmpty, IsString, IsIn } from 'class-validator';

export class ValidateQuestionDto {
  @IsNotEmpty()
  @IsString()
  question: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(['Yes', 'No'], { message: 'desiredAnswer must be either "Yes" or "No"' })
  desiredAnswer: 'Yes' | 'No';
} 