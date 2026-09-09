import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';

export type SettlementDocument = Settlement & Document;

@Schema({ timestamps: true })
export class Settlement {
  @Prop({ type: Types.ObjectId, ref: 'Group', required: true })
  groupId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  fromUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  toUserId: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 1 })
  amountInPaisa: number;
}

export const SettlementSchema = SchemaFactory.createForClass(Settlement);
SettlementSchema.index({ groupId: 1, createdAt: -1 });
