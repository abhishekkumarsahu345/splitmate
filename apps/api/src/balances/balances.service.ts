import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model, Types } from 'mongoose';
import { Expense, ExpenseDocument } from '../expenses/schemas/expense.schema.js';
import { Settlement, SettlementDocument } from '../settlements/schemas/settlement.schema.js';
import { Membership, MembershipDocument } from '../groups/schemas/membership.schema.js';
import { simplifyDebts, Payment } from './debt-simplifier.js';

export interface UserBalance {
  name: string;
  email: string;
  balance: number;
}

@Injectable()
export class BalancesService {
  constructor(
    @InjectModel(Expense.name) private expenseModel: Model<ExpenseDocument>,
    @InjectModel(Settlement.name) private settlementModel: Model<SettlementDocument>,
    @InjectModel(Membership.name) private membershipModel: Model<MembershipDocument>,
  ) {}

  async getBalances(groupId: string): Promise<Record<string, UserBalance>> {
    const gid = new Types.ObjectId(groupId);

    // 1. Get all current members with user info populated
    const memberships = await this.membershipModel
      .find({ groupId: gid })
      .populate('userId', 'name email')
      .exec();

    // 2. Build a map of userId → { name, email, balance: 0 }
    const balanceMap: Record<string, UserBalance> = {};
    for (const m of memberships) {
      const user = m.userId as any;
      balanceMap[user._id.toString()] = {
        name: user.name,
        email: user.email,
        balance: 0,
      };
    }

    // 3. Process expenses and settlements in parallel
    const [expenses, settlements] = await Promise.all([
      this.expenseModel.find({ groupId: gid, deletedAt: null }).exec(),
      this.settlementModel.find({ groupId: gid }).exec(),
    ]);

    // paidBy gets credit (+), split members get debit (-)
    for (const expense of expenses) {
      const paidById = expense.paidByUserId.toString();
      if (balanceMap[paidById] !== undefined) {
        balanceMap[paidById].balance += expense.amountInPaisa;
      }
      for (const split of expense.splits) {
        const splitUserId = split.userId.toString();
        if (balanceMap[splitUserId] !== undefined) {
          balanceMap[splitUserId].balance -= split.shareInPaisa;
        }
      }
    }

    // 4. Process settlements: payer (fromUser) pays debt (+), payee (toUser) credit reduced (-)
    for (const settlement of settlements) {
      const fromId = settlement.fromUserId.toString();
      const toId = settlement.toUserId.toString();
      if (balanceMap[fromId] !== undefined) {
        balanceMap[fromId].balance += settlement.amountInPaisa;
      }
      if (balanceMap[toId] !== undefined) {
        balanceMap[toId].balance -= settlement.amountInPaisa;
      }
    }

    return balanceMap;
  }

  async getSimplified(groupId: string): Promise<Payment[]> {
    const balanceMap = await this.getBalances(groupId);
    const numericBalances: Record<string, number> = {};
    for (const [userId, data] of Object.entries(balanceMap)) {
      numericBalances[userId] = data.balance;
    }
    return simplifyDebts(numericBalances);
  }
}
