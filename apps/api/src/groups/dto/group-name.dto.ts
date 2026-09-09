import { IsString, MinLength, MaxLength } from 'class-validator';

export class GroupNameDto {
  @IsString()
  @MinLength(1, { message: 'Group name is required' })
  @MaxLength(100, { message: 'Group name must be 100 characters or fewer' })
  name: string;
}
