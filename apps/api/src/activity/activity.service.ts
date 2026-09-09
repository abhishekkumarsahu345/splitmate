import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { ClientSession, Model, Types } from 'mongoose';
import { ActivityLog, ActivityLogDocument, ActivityLogType } from './schemas/activity-log.schema.js';

@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(ActivityLog.name) private activityLogModel: Model<ActivityLogDocument>,
  ) {}

  async log(
    groupId: string | Types.ObjectId,
    actorUserId: string | Types.ObjectId,
    type: ActivityLogType,
    entityId: string | Types.ObjectId,
    metadata?: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<ActivityLogDocument> {
    const [entry] = await this.activityLogModel.create(
      [{ groupId, actorUserId, type, entityId, metadata }],
      { session },
    );
    return entry;
  }

  async getForGroup(groupId: string, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      this.activityLogModel
        .find({ groupId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .populate('actorUserId', 'name email')
        .exec(),
      this.activityLogModel.countDocuments({ groupId }).exec(),
    ]);
    return { data, total, page, pageSize };
  }
}
