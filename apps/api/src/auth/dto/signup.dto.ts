import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;

  @IsString()
  @MinLength(1, { message: 'name is required' })
  name: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d).+$/, {
    message: 'password must contain at least one letter and one digit',
  })
  password: string;
}
