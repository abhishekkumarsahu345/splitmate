import { IsInt, IsMongoId, Min } from 'class-validator';

export class CreateSettlementDto {
  @IsMongoId()
  payerId: string;

  @IsMongoId()
  payeeId: string;

  @IsInt()
  @Min(1)
  amountInPaisa: number;
}
