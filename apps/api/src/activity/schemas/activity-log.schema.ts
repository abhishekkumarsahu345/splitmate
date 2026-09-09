import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';

export type ActivityLogDocument = ActivityLog & Document;

export type ActivityLogType =
  | 'EXPENSE_ADDED'
  | 'EXPENSE_EDITED'
  | 'EXPENSE_DELETED'
  | 'MEMBER_ADDED'
  | 'MEMBER_REMOVED'
  | 'SETTLEMENT_RECORDED';

const ACTIVITY_LOG_TYPES: ActivityLogType[] = [
  'EXPENSE_ADDED',
  'EXPENSE_EDITED',
  'EXPENSE_DELETED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'SETTLEMENT_RECORDED',
];

@Schema({ timestamps: true })
export class ActivityLog {
  @Prop({ type: Types.ObjectId, ref: 'Group', required: true })
  groupId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorUserId: Types.ObjectId;

  @Prop({ type: String, enum: ACTIVITY_LOG_TYPES, required: true })
  type: ActivityLogType;

  @Prop({ type: Types.ObjectId })
  entityId: Types.ObjectId;

  @Prop({ type: Object })
  metadata: Record<string, unknown>;
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);
ActivityLogSchema.index({ groupId: 1, createdAt: -1 });
