import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import mongoose, { Model, Types } from 'mongoose';
import { Expense, ExpenseDocument } from './schemas/expense.schema.js';
import { Membership, MembershipDocument } from '../groups/schemas/membership.schema.js';
import { Group, GroupDocument } from '../groups/schemas/group.schema.js';
import { ActivityLog, ActivityLogDocument } from '../activity/schemas/activity-log.schema.js';
import { ActivityService } from '../activity/activity.service.js';
import { SocketGateway } from '../socket/socket.gateway.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { splitEqually } from './split-calculator.js';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectModel(Expense.name)
    private readonly expenseModel: Model<ExpenseDocument>,

    @InjectModel(Membership.name)
    private readonly membershipModel: Model<MembershipDocument>,

    @InjectModel(Group.name)
    private readonly groupModel: Model<GroupDocument>,

    @InjectModel(ActivityLog.name)
    private readonly activityLogModel: Model<ActivityLogDocument>,

    @InjectConnection()
    private readonly connection: mongoose.Connection,

    private readonly activityService: ActivityService,

    @Optional()
    private readonly socketGateway: SocketGateway | null,
  ) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(groupId: string, userId: string, dto: CreateExpenseDto): Promise<ExpenseDocument> {
    // Validate paidByUserId is a group member
    await this.validateMemberships(groupId, [dto.paidByUserId]);

    // Build the splits array
    const splits = await this.buildSplits(groupId, dto);

    let createdExpense: ExpenseDocument;

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const [expense] = await this.expenseModel.create(
          [
            {
              groupId: new Types.ObjectId(groupId),
              description: dto.description,
              amountInPaisa: dto.amountInPaisa,
              paidByUserId: new Types.ObjectId(dto.paidByUserId),
              date: dto.date,
              splitType: dto.splitType,
              splits,
              createdByUserId: new Types.ObjectId(userId),
              deletedAt: null,
            },
          ],
          { session },
        );

        createdExpense = expense;

        await this.activityLogModel.create(
          [
            {
              groupId: new Types.ObjectId(groupId),
              actorUserId: new Types.ObjectId(userId),
              type: 'EXPENSE_ADDED',
              entityId: expense._id,
              metadata: { description: dto.description, amountInPaisa: dto.amountInPaisa },
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    this.emitBalancesUpdated(groupId);
    // Emit activity:new so ActivityTab updates live for all group members
    void this.emitActivityNew(groupId, createdExpense!._id.toString());

    return createdExpense!;
  }

  // ─── Personal History ──────────────────────────────────────────────────────

  async getHistory(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: ExpenseDocument[]; total: number; page: number; pageSize: number }> {
    if (page < 1) throw new UnprocessableEntityException('page must be >= 1');
    if (pageSize < 1 || pageSize > 100)
      throw new UnprocessableEntityException('pageSize must be between 1 and 100');

    const uid = new Types.ObjectId(userId);
    const filter = {
      deletedAt: null,
      $or: [
        { paidByUserId: uid },
        { 'splits.userId': uid },
      ],
    };

    const [data, total] = await Promise.all([
      this.expenseModel
        .find(filter)
        .sort({ date: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .populate('groupId', 'name')
        .populate('paidByUserId', 'name email')
        .exec(),
      this.expenseModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, pageSize };
  }

  // ─── FindAll ───────────────────────────────────────────────────────────────

  async findAll(
    groupId: string,
    page: number,
    pageSize: number,
    sortBy: 'date' | 'amount',
    sortOrder: 'asc' | 'desc',
  ): Promise<{ data: ExpenseDocument[]; total: number; page: number; pageSize: number }> {
    if (page < 1) {
      throw new UnprocessableEntityException('page must be >= 1');
    }
    if (pageSize < 1 || pageSize > 100) {
      throw new UnprocessableEntityException('pageSize must be between 1 and 100');
    }

    const sortField = sortBy === 'amount' ? 'amountInPaisa' : 'date';
    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const filter = { groupId: new Types.ObjectId(groupId), deletedAt: null };

    const [data, total] = await Promise.all([
      this.expenseModel
        .find(filter)
        .sort({ [sortField]: sortDir })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .exec(),
      this.expenseModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, pageSize };
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(
    groupId: string,
    expenseId: string,
    userId: string,
    dto: UpdateExpenseDto,
  ): Promise<ExpenseDocument> {
    const expense = await this.findActiveExpense(groupId, expenseId);
    await this.assertCanModify(expense, groupId, userId);

    // Merge incoming fields with existing values for split validation
    const merged = this.mergeForValidation(expense, dto);
    const splits = await this.buildSplits(groupId, merged);

    let updatedExpense: ExpenseDocument | null = null;

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        updatedExpense = await this.expenseModel
          .findByIdAndUpdate(
            expenseId,
            {
              $set: {
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.amountInPaisa !== undefined && { amountInPaisa: dto.amountInPaisa }),
                ...(dto.paidByUserId !== undefined && {
                  paidByUserId: new Types.ObjectId(dto.paidByUserId),
                }),
                ...(dto.date !== undefined && { date: dto.date }),
                ...(dto.splitType !== undefined && { splitType: dto.splitType }),
                splits,
              },
            },
            { new: true, session },
          )
          .exec();

        await this.activityLogModel.create(
          [
            {
              groupId: new Types.ObjectId(groupId),
              actorUserId: new Types.ObjectId(userId),
              type: 'EXPENSE_EDITED',
              entityId: new Types.ObjectId(expenseId),
              metadata: { description: updatedExpense?.description, amountInPaisa: updatedExpense?.amountInPaisa },
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    if (!updatedExpense) {
      throw new NotFoundException('Expense not found');
    }

    this.emitBalancesUpdated(groupId);
    // Emit activity:new so ActivityTab updates live for all group members
    void this.emitActivityNew(groupId, (updatedExpense as ExpenseDocument)._id.toString());

    return updatedExpense;
  }

  // ─── Remove ────────────────────────────────────────────────────────────────

  async remove(
    groupId: string,
    expenseId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const expense = await this.findActiveExpense(groupId, expenseId);
    await this.assertCanModify(expense, groupId, userId);

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.expenseModel
          .findByIdAndUpdate(expenseId, { $set: { deletedAt: new Date() } }, { session })
          .exec();

        await this.activityLogModel.create(
          [
            {
              groupId: new Types.ObjectId(groupId),
              actorUserId: new Types.ObjectId(userId),
              type: 'EXPENSE_DELETED',
              entityId: new Types.ObjectId(expenseId),
              metadata: { description: expense.description },
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    this.emitBalancesUpdated(groupId);
    // Emit activity:new so ActivityTab updates live for all group members
    void this.emitActivityNew(groupId, expense._id.toString());

    return { message: 'Expense deleted' };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async validateMemberships(groupId: string, userIds: string[]): Promise<void> {
    const memberships = await this.membershipModel
      .find({
        groupId: new Types.ObjectId(groupId),
        userId: { $in: userIds.map((id) => new Types.ObjectId(id)) },
      })
      .exec();

    const foundIds = new Set(memberships.map((m) => m.userId.toString()));
    const missing = userIds.filter((id) => !foundIds.has(id));

    if (missing.length > 0) {
      throw new UnprocessableEntityException(
        `Users not members of this group: ${missing.join(', ')}`,
      );
    }
  }

  private async isGroupOwner(groupId: string, userId: string): Promise<boolean> {
    const group = await this.groupModel.findById(groupId).exec();
    if (!group) return false;
    return group.ownerId.toString() === userId;
  }

  private async findActiveExpense(
    groupId: string,
    expenseId: string,
  ): Promise<ExpenseDocument> {
    let expense: ExpenseDocument | null = null;
    try {
      expense = await this.expenseModel
        .findOne({
          _id: new Types.ObjectId(expenseId),
          groupId: new Types.ObjectId(groupId),
          deletedAt: null,
        })
        .exec();
    } catch {
      throw new NotFoundException('Expense not found');
    }

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }
    return expense;
  }

  private async assertCanModify(
    expense: ExpenseDocument,
    groupId: string,
    userId: string,
  ): Promise<void> {
    const isCreator = expense.createdByUserId.toString() === userId;
    const isOwner = await this.isGroupOwner(groupId, userId);
    if (!isCreator && !isOwner) {
      throw new ForbiddenException('You do not have permission to modify this expense');
    }
  }

  /**
   * Builds the splits array from the DTO, performing all split-specific validations.
   * Works for both CreateExpenseDto and a merged object during update.
   */
  private async buildSplits(
    groupId: string,
    dto: {
      splitType: 'EQUAL' | 'EXACT';
      amountInPaisa: number;
      memberIds?: string[];
      shares?: Array<{ userId: string; amount: number }>;
    },
  ): Promise<Array<{ userId: Types.ObjectId; shareInPaisa: number }>> {
    if (dto.splitType === 'EQUAL') {
      if (!dto.memberIds || dto.memberIds.length === 0) {
        throw new UnprocessableEntityException(
          'memberIds is required for EQUAL split',
        );
      }
      await this.validateMemberships(groupId, dto.memberIds);

      const shareMap = splitEqually(dto.amountInPaisa, dto.memberIds);
      return Object.entries(shareMap).map(([uid, share]) => ({
        userId: new Types.ObjectId(uid),
        shareInPaisa: share,
      }));
    } else {
      // EXACT
      if (!dto.shares || dto.shares.length === 0) {
        throw new UnprocessableEntityException('shares is required for EXACT split');
      }

      const total = dto.shares.reduce((sum, s) => sum + s.amount, 0);
      if (total !== dto.amountInPaisa) {
        throw new UnprocessableEntityException('Split amounts must sum to total');
      }

      await this.validateMemberships(groupId, dto.shares.map((s) => s.userId));

      return dto.shares.map((s) => ({
        userId: new Types.ObjectId(s.userId),
        shareInPaisa: s.amount,
      }));
    }
  }

  /**
   * Merges an UpdateExpenseDto on top of an existing expense to produce a
   * complete object that can be passed to buildSplits for re-validation.
   */
  private mergeForValidation(
    expense: ExpenseDocument,
    dto: UpdateExpenseDto,
  ): {
    splitType: 'EQUAL' | 'EXACT';
    amountInPaisa: number;
    memberIds?: string[];
    shares?: Array<{ userId: string; amount: number }>;
  } {
    const splitType = dto.splitType ?? expense.splitType;
    const amountInPaisa = dto.amountInPaisa ?? expense.amountInPaisa;

    // If a new splitType or new split data is provided, use the DTO values.
    // Otherwise fall back to re-deriving from the stored splits.
    if (dto.memberIds !== undefined || dto.shares !== undefined) {
      return { splitType, amountInPaisa, memberIds: dto.memberIds, shares: dto.shares };
    }

    // Reconstruct from stored splits so we can re-validate if only amount changed.
    if (splitType === 'EQUAL') {
      const memberIds = expense.splits.map((s) => s.userId.toString());
      return { splitType, amountInPaisa, memberIds };
    } else {
      const shares = expense.splits.map((s) => ({
        userId: s.userId.toString(),
        amount: s.shareInPaisa,
      }));
      return { splitType, amountInPaisa, shares };
    }
  }

  private emitBalancesUpdated(groupId: string): void {
    if (this.socketGateway) {
      // Use the canonical 'balances:updated' event name that clients listen on
      this.socketGateway.emitToGroup(groupId, 'balances:updated', { groupId });
    }
  }

  /**
   * Fetches the latest activity log entry for the given entity, populates the
   * actor, fetches member IDs for the group, then emits 'activity:new' to all
   * group members so the ActivityTab updates in real time.
   */
  private async emitActivityNew(groupId: string, entityId: string): Promise<void> {
    if (!this.socketGateway) return;
    try {
      const entry = await this.activityLogModel
        .findOne({ groupId: new Types.ObjectId(groupId), entityId: new Types.ObjectId(entityId) })
        .sort({ createdAt: -1 })
        .populate('actorUserId', 'name email')
        .lean()
        .exec();
      if (!entry) return;

      const memberships = await this.membershipModel
        .find({ groupId: new Types.ObjectId(groupId) })
        .select('userId')
        .lean()
        .exec();
      const memberIds = memberships.map((m) => m.userId.toString());

      this.socketGateway.emitActivityNew(groupId, entry, memberIds);
    } catch {
      // Non-critical — don't let socket errors bubble up
    }
  }
}
