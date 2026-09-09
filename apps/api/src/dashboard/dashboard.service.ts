import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model, Types } from 'mongoose';
import { ActivityLog, ActivityLogDocument } from '../activity/schemas/activity-log.schema.js';
import { Expense, ExpenseDocument } from '../expenses/schemas/expense.schema.js';
import { Group, GroupDocument } from '../groups/schemas/group.schema.js';
import { Settlement, SettlementDocument } from '../settlements/schemas/settlement.schema.js';
import { Membership, MembershipDocument } from '../groups/schemas/membership.schema.js';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Expense.name) private expenseModel: Model<ExpenseDocument>,
    @InjectModel(Group.name) private groupModel: Model<GroupDocument>,
    @InjectModel(Settlement.name) private settlementModel: Model<SettlementDocument>,
    @InjectModel(Membership.name) private membershipModel: Model<MembershipDocument>,
    @InjectModel(ActivityLog.name) private activityLogModel: Model<ActivityLogDocument>,
  ) {}

  async getDashboard(userId: string) {
    const uid = new Types.ObjectId(userId);

    // Get all groups the user belongs to
    const memberships = await this.membershipModel.find({ userId: uid }).lean().exec();
    const groupIds = memberships.map((m) => m.groupId);
    const groupCount = groupIds.length;

    // Compute balance per group for this user — run all groups in parallel
    const groupNetMap: Record<string, number> = {};

    await Promise.all(
      groupIds.map(async (groupId) => {
        const [paidAgg, owedAgg, settledPaidAgg, settledReceivedAgg] = await Promise.all([
          // paidCredit: expenses where this user paid
          this.expenseModel.aggregate([
            { $match: { groupId, paidByUserId: uid, deletedAt: null } },
            { $group: { _id: null, total: { $sum: '$amountInPaisa' } } },
          ]),
          // owedDebit: splits assigned to this user
          this.expenseModel.aggregate([
            { $match: { groupId, deletedAt: null } },
            { $unwind: '$splits' },
            { $match: { 'splits.userId': uid } },
            { $group: { _id: null, total: { $sum: '$splits.shareInPaisa' } } },
          ]),
          // settledPaid: settlements this user paid out
          this.settlementModel.aggregate([
            { $match: { groupId, fromUserId: uid } },
            { $group: { _id: null, total: { $sum: '$amountInPaisa' } } },
          ]),
          // settledReceived: settlements this user received
          this.settlementModel.aggregate([
            { $match: { groupId, toUserId: uid } },
            { $group: { _id: null, total: { $sum: '$amountInPaisa' } } },
          ]),
        ]);

        const paidCredit: number = paidAgg[0]?.total ?? 0;
        const owedDebit: number = owedAgg[0]?.total ?? 0;
        const settledPaid: number = settledPaidAgg[0]?.total ?? 0;
        const settledReceived: number = settledReceivedAgg[0]?.total ?? 0;

        const netBalance = paidCredit - owedDebit + settledPaid - settledReceived;
        groupNetMap[groupId.toString()] = netBalance;
      }),
    );

    // Accumulate totals from the completed map
    let totalOwed = 0;  // others owe user
    let totalOwing = 0; // user owes others

    for (const net of Object.values(groupNetMap)) {
      if (net > 0) totalOwed += net;
      else if (net < 0) totalOwing += -net;
    }

    // Find the group where this user owes the most (largest negative net)
    let groupWithMostDebt: { id: string; name: string; amountInPaisa: number } | null = null;
    let worstNet = 0;
    for (const [gid, net] of Object.entries(groupNetMap)) {
      if (net < worstNet) {
        worstNet = net;
        groupWithMostDebt = { id: gid, name: '', amountInPaisa: -net };
      }
    }

    // Resolve the group name and recent activity in parallel
    const [resolvedGroup, recentActivity] = await Promise.all([
      groupWithMostDebt
        ? this.groupModel.findById(groupWithMostDebt.id).select('name').lean().exec()
        : Promise.resolve(null),
      this.activityLogModel
        .find({ groupId: { $in: groupIds } })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('actorUserId', 'name email')
        .lean()
        .exec(),
    ]);

    if (groupWithMostDebt && resolvedGroup) {
      groupWithMostDebt.name = resolvedGroup.name;
    }

    return {
      totalOwed,
      totalOwing,
      netBalance: totalOwed - totalOwing,
      groupCount,
      groupWithMostDebt,
      recentActivity,
    };
  }
}
