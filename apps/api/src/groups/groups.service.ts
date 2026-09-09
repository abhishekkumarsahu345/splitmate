import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import mongoose, { Model, Types } from 'mongoose';
import { Group, GroupDocument } from './schemas/group.schema.js';
import { Membership, MembershipDocument } from './schemas/membership.schema.js';
import { User, UserDocument } from '../users/schemas/user.schema.js';
import { Expense, ExpenseDocument } from '../expenses/schemas/expense.schema.js';
import { Settlement, SettlementDocument } from '../settlements/schemas/settlement.schema.js';
import { ActivityLog, ActivityLogDocument } from '../activity/schemas/activity-log.schema.js';
import { ActivityService } from '../activity/activity.service.js';

@Injectable()
export class GroupsService {
  constructor(
    @InjectModel(Group.name) private groupModel: Model<GroupDocument>,
    @InjectModel(Membership.name) private membershipModel: Model<MembershipDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Expense.name) private expenseModel: Model<ExpenseDocument>,
    @InjectModel(Settlement.name) private settlementModel: Model<SettlementDocument>,
    @InjectModel(ActivityLog.name) private activityLogModel: Model<ActivityLogDocument>,
    @InjectConnection() private connection: mongoose.Connection,
    private activityService: ActivityService,
  ) {}

  // ── 1. Create group ────────────────────────────────────────────────────────

  async create(userId: string, name: string) {
    const session = await this.connection.startSession();
    let group: GroupDocument;

    await session.withTransaction(async () => {
      const [created] = await this.groupModel.create(
        [{ name, ownerId: new Types.ObjectId(userId) }],
        { session },
      );
      group = created;

      await this.membershipModel.create(
        [{ userId: new Types.ObjectId(userId), groupId: created._id }],
        { session },
      );

      await this.activityService.log(
        created._id,
        userId,
        'MEMBER_ADDED',
        created._id,
        { memberUserId: userId },
        session,
      );
    });

    await session.endSession();

    return {
      id: group!._id,
      name: group!.name,
      ownerId: group!.ownerId,
    };
  }

  // ── 2. List all groups for user ────────────────────────────────────────────

  async findAllForUser(userId: string) {
    const memberships = await this.membershipModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('groupId')
      .lean()
      .exec();

    const groupIds = memberships.map((m) => m.groupId);

    const groups = await this.groupModel
      .find({ _id: { $in: groupIds }, deletedAt: null })
      .lean()
      .exec();

    return groups;
  }

  // ── 3. Find one group ─────────────────────────────────────────────────────

  async findOne(groupId: string, userId: string) {
    const group = await this.groupModel.findById(groupId).lean().exec();
    if (!group || group.deletedAt) throw new NotFoundException('Group not found');

    const isMember = await this.membershipModel
      .exists({ userId: new Types.ObjectId(userId), groupId: new Types.ObjectId(groupId) })
      .exec();
    if (!isMember) throw new ForbiddenException('You are not a member of this group');

    // Populate members via Membership → User
    const memberships = await this.membershipModel
      .find({ groupId: new Types.ObjectId(groupId) })
      .populate<{ userId: UserDocument }>('userId', 'name email')
      .exec();

    const members = memberships.map((m) => {
      const u = m.userId as any;
      return { _id: u._id, name: u.name, email: u.email };
    });

    return { ...group, members };
  }

  // ── 4. Update group name ───────────────────────────────────────────────────

  async update(groupId: string, userId: string, name: string) {
    const group = await this.groupModel.findById(groupId).exec();
    if (!group || group.deletedAt) throw new NotFoundException('Group not found');
    if (group.ownerId.toString() !== userId)
      throw new ForbiddenException('Only the group owner can perform this action');

    group.name = name;
    await group.save();

    return { id: group._id, name: group.name, ownerId: group.ownerId };
  }

  // ── 5. Delete group (soft delete + cascade) ────────────────────────────────

  async remove(groupId: string, userId: string) {
    const group = await this.groupModel.findById(groupId).exec();
    if (!group || group.deletedAt) throw new NotFoundException('Group not found');
    if (group.ownerId.toString() !== userId)
      throw new ForbiddenException('Only the group owner can perform this action');

    const gid = new Types.ObjectId(groupId);
    const session = await this.connection.startSession();

    await session.withTransaction(async () => {
      await this.groupModel.updateOne({ _id: gid }, { deletedAt: new Date() }, { session });
      await this.membershipModel.deleteMany({ groupId: gid }, { session });
      await this.expenseModel.deleteMany({ groupId: gid }, { session });
      await this.settlementModel.deleteMany({ groupId: gid }, { session });
      await this.activityLogModel.deleteMany({ groupId: gid }, { session });
    });

    await session.endSession();

    return { message: 'Group deleted' };
  }

  // ── 6. Add member ──────────────────────────────────────────────────────────

  async addMember(groupId: string, requesterId: string, targetUserId: string) {
    const group = await this.groupModel.findById(groupId).exec();
    if (!group || group.deletedAt) throw new NotFoundException('Group not found');
    if (group.ownerId.toString() !== requesterId)
      throw new ForbiddenException('Only the group owner can perform this action');

    const targetUser = await this.userModel.findById(targetUserId).exec();
    if (!targetUser) throw new NotFoundException('User not found');

    const existing = await this.membershipModel
      .exists({
        userId: new Types.ObjectId(targetUserId),
        groupId: new Types.ObjectId(groupId),
      })
      .exec();
    if (existing) throw new ConflictException('User is already a member of this group');

    const gid = new Types.ObjectId(groupId);
    const tid = new Types.ObjectId(targetUserId);
    const session = await this.connection.startSession();
    let membership: MembershipDocument;

    await session.withTransaction(async () => {
      const [created] = await this.membershipModel.create(
        [{ userId: tid, groupId: gid }],
        { session },
      );
      membership = created;

      await this.activityService.log(
        gid,
        requesterId,
        'MEMBER_ADDED',
        tid,
        { memberUserId: targetUserId },
        session,
      );
    });

    await session.endSession();

    return membership!;
  }

  // ── 7. Remove member ───────────────────────────────────────────────────────

  async removeMember(groupId: string, requesterId: string, targetUserId: string) {
    const group = await this.groupModel.findById(groupId).exec();
    if (!group || group.deletedAt) throw new NotFoundException('Group not found');
    if (group.ownerId.toString() !== requesterId)
      throw new ForbiddenException('Only the group owner can perform this action');

    const gid = new Types.ObjectId(groupId);
    const tid = new Types.ObjectId(targetUserId);

    // Verify member exists in group
    const membership = await this.membershipModel.findOne({ userId: tid, groupId: gid }).exec();
    if (!membership) throw new NotFoundException('User is not a member of this group');

    // ── Net balance computation ──────────────────────────────────────────────
    // paidCredit: total amount the member paid for (as expense payer)
    const paidCreditAgg = await this.expenseModel
      .aggregate([
        { $match: { groupId: gid, paidByUserId: tid, deletedAt: null } },
        { $group: { _id: null, total: { $sum: '$amountInPaisa' } } },
      ])
      .exec();
    const paidCredit: number = paidCreditAgg[0]?.total ?? 0;

    // owedDebit: total share the member owes across all expenses
    const owedDebitAgg = await this.expenseModel
      .aggregate([
        { $match: { groupId: gid, deletedAt: null } },
        { $unwind: '$splits' },
        { $match: { 'splits.userId': tid } },
        { $group: { _id: null, total: { $sum: '$splits.shareInPaisa' } } },
      ])
      .exec();
    const owedDebit: number = owedDebitAgg[0]?.total ?? 0;

    // settledPaid: total the member paid out in settlements
    const settledPaidAgg = await this.settlementModel
      .aggregate([
        { $match: { groupId: gid, fromUserId: tid } },
        { $group: { _id: null, total: { $sum: '$amountInPaisa' } } },
      ])
      .exec();
    const settledPaid: number = settledPaidAgg[0]?.total ?? 0;

    // settledReceived: total the member received in settlements
    const settledReceivedAgg = await this.settlementModel
      .aggregate([
        { $match: { groupId: gid, toUserId: tid } },
        { $group: { _id: null, total: { $sum: '$amountInPaisa' } } },
      ])
      .exec();
    const settledReceived: number = settledReceivedAgg[0]?.total ?? 0;

    const netBalance = paidCredit - owedDebit + settledPaid - settledReceived;
    if (netBalance !== 0) {
      throw new UnprocessableEntityException('Member has outstanding balance');
    }

    // ── Transactional removal ────────────────────────────────────────────────
    const session = await this.connection.startSession();

    await session.withTransaction(async () => {
      await this.membershipModel.deleteOne({ userId: tid, groupId: gid }, { session });
      await this.activityService.log(
        gid,
        requesterId,
        'MEMBER_REMOVED',
        tid,
        { memberUserId: targetUserId },
        session,
      );
    });

    await session.endSession();

    return { message: 'Member removed' };
  }
}
