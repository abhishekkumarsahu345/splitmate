import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';

// --- SplitEntry sub-document ---

@Schema({ _id: false })
export class SplitEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Number, required: true })
  shareInPaisa: number;
}

export const SplitEntrySchema = SchemaFactory.createForClass(SplitEntry);

// --- Expense document ---

export type ExpenseDocument = Expense & Document;

@Schema({ timestamps: true })
export class Expense {
  @Prop({ type: Types.ObjectId, ref: 'Group', required: true })
  groupId: Types.ObjectId;

  @Prop({ required: true })
  description: string;

  @Prop({ type: Number, required: true })
  amountInPaisa: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  paidByUserId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  date: Date;

  @Prop({ type: String, enum: ['EQUAL', 'EXACT'], required: true })
  splitType: 'EQUAL' | 'EXACT';

  @Prop({ type: [SplitEntrySchema], default: [] })
  splits: SplitEntry[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);
ExpenseSchema.index({ groupId: 1, date: -1 });
ExpenseSchema.index({ groupId: 1, amountInPaisa: -1 });
