import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { Group, GroupDocument } from '../schemas/group.schema.js';

@Injectable()
export class GroupOwnerGuard implements CanActivate {
  constructor(@InjectModel(Group.name) private groupModel: Model<GroupDocument>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.id;
    const groupId = req.params?.id || req.params?.groupId;
    const group = await this.groupModel.findById(groupId).exec();
    if (!group || group.deletedAt) throw new NotFoundException('Group not found');
    if (group.ownerId.toString() !== userId)
      throw new ForbiddenException('Only the group owner can perform this action');
    return true;
  }
}
