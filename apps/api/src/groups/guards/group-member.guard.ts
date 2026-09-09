import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model, Types } from 'mongoose';
import { Membership, MembershipDocument } from '../schemas/membership.schema.js';

@Injectable()
export class GroupMemberGuard implements CanActivate {
  constructor(
    @InjectModel(Membership.name) private membershipModel: Model<MembershipDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.id;
    const groupId = req.params?.id || req.params?.groupId;

    if (!userId || !groupId) throw new ForbiddenException('Access denied');

    // Explicitly cast to ObjectId to avoid string-vs-ObjectId mismatch in MongoDB query
    let userObjId: Types.ObjectId;
    let groupObjId: Types.ObjectId;
    try {
      userObjId  = new Types.ObjectId(userId);
      groupObjId = new Types.ObjectId(groupId);
    } catch {
      throw new ForbiddenException('Access denied');
    }

    const member = await this.membershipModel
      .findOne({ userId: userObjId, groupId: groupObjId })
      .lean()
      .exec();

    if (!member) throw new ForbiddenException('You are not a member of this group');
    return true;
  }
}
