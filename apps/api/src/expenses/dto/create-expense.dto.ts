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

export class ShareEntry {
  @IsMongoId()
  userId: string;

  @IsInt()
  @Min(0)
  amount: number;
}

export class CreateExpenseDto {
  @IsString()
  description: string;

  @IsInt()
  @Min(1)
  amountInPaisa: number;

  @IsMongoId()
  paidByUserId: string;

  @Type(() => Date)
  @IsDate()
  date: Date;

  @IsEnum(['EQUAL', 'EXACT'])
  splitType: 'EQUAL' | 'EXACT';

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
