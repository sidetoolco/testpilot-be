import { IsEmail, IsNotEmpty } from 'class-validator';

export class InviteTeamMemberDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;
}
