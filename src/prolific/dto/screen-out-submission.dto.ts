import { IsNotEmpty, IsString } from "class-validator";

export class ScreenOutSubmissionDto {
    @IsNotEmpty()
    @IsString()
    studyId: string;

    @IsNotEmpty()
    @IsString()
    participantId: string;
}