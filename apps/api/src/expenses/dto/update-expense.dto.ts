import {
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  Min,
  ValidateNested,
  IsString,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ShareEntry } from './create-expense.dto.js';

export class UpdateExpenseDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amountInPaisa?: number;

  @IsOptional()
  @IsMongoId()
  paidByUserId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @IsOptional()
  @IsEnum(['EQUAL', 'EXACT'])
  splitType?: 'EQUAL' | 'EXACT';

  // For EQUAL split
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @ArrayMinSize(1)
  memberIds?: string[];

  // For EXACT split
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShareEntry)
  shares?: ShareEntry[];
}
