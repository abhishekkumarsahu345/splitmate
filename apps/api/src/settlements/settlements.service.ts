import { forwardRef, Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import mongoose, { Model, Types } from 'mongoose';
import { ActivityService } from '../activity/activity.service.js';
import { ActivityLog, ActivityLogDocument } from '../activity/schemas/activity-log.schema.js';
import { BalancesService } from '../balances/balances.service.js';
import { Membership, MembershipDocument } from '../groups/schemas/membership.schema.js';
import { SocketGateway } from '../socket/socket.gateway.js';
import { CreateSettlementDto } from './dto/create-settlement.dto.js';
import { Settlement, SettlementDocument } from './schemas/settlement.schema.js';

@Injectable()
export class SettlementsService {
  constructor(
    @InjectModel(Settlement.name) private settlementModel: Model<SettlementDocument>,
    @InjectModel(Membership.name) private membershipModel: Model<MembershipDocument>,
    @InjectModel(ActivityLog.name) private activityLogModel: Model<ActivityLogDocument>,
    @InjectConnection() private connection: mongoose.Connection,
    private readonly activityService: ActivityService,
    private readonly balancesService: BalancesService,
    @Inject(forwardRef(() => SocketGateway)) private readonly socketGateway: SocketGateway,
  ) {}

  async create(groupId: string, userId: string, dto: CreateSettlementDto): Promise<SettlementDocument> {
    const gid = new Types.ObjectId(groupId);

    // Security: the authenticated user can only settle their OWN debt.
    // They cannot submit a settlement on behalf of another member.
    if (dto.payerId !== userId) {
      throw new UnprocessableEntityException(
        'You can only settle your own debt — payerId must be your own user ID',
      );
    }

    // Validate payer and payee are not the same person (Requirement 17)
    if (dto.payerId === dto.payeeId) {
      throw new UnprocessableEntityException('Payer and payee must be different people');
    }

    // Validate payerId is a member of the group (Requirement 13.4)
    const payerMembership = await this.membershipModel
      .findOne({ groupId: gid, userId: new Types.ObjectId(dto.payerId) })
      .exec();
    if (!payerMembership) {
      throw new UnprocessableEntityException('Payer is not a member of this group');
    }

    // Validate payeeId is a member of the group (Requirement 13.4)
    const payeeMembership = await this.membershipModel
      .findOne({ groupId: gid, userId: new Types.ObjectId(dto.payeeId) })
      .exec();
    if (!payeeMembership) {
      throw new UnprocessableEntityException('Payee is not a member of this group');
    }

    // Validate the payer actually owes money to the payee (Requirement 17).
    // Prevents phantom settlements between members with no financial relationship.
    const balances = await this.balancesService.getBalances(groupId);
    const payerBalance = balances[dto.payerId]?.balance ?? 0;
    if (payerBalance >= 0) {
      throw new UnprocessableEntityException(
        'Payer does not owe anyone in this group — no settlement needed',
      );
    }
    const simplified = await this.balancesService.getSimplified(groupId);
    const hasDebtToPayee = simplified.some(
      (p) => p.from === dto.payerId && p.to === dto.payeeId,
    );
    if (!hasDebtToPayee) {
      throw new UnprocessableEntityException(
        'Payer does not owe the selected payee — check the Balances tab for who owes whom',
      );
    }

    const session = await this.connection.startSession();
    let created: SettlementDocument;

    await session.withTransaction(async () => {
      const [settlement] = await this.settlementModel.create(
        [
          {
            groupId: gid,
            fromUserId: new Types.ObjectId(dto.payerId),
            toUserId: new Types.ObjectId(dto.payeeId),
            amountInPaisa: dto.amountInPaisa,
          },
        ],
        { session },
      );
      created = settlement;

      await this.activityService.log(
        groupId,
        userId,
        'SETTLEMENT_RECORDED',
        settlement._id,
        {
          fromUserId: dto.payerId,
          toUserId: dto.payeeId,
          amountInPaisa: dto.amountInPaisa,
        },
        session,
      );
    });

    await session.endSession();

    // Notify group members via WebSocket (non-blocking, best-effort)
    this.socketGateway.emitToGroup(groupId, 'settlement:created', created!);
    // Also trigger balance refresh so BalancesTab and ExpensesTab update live
    this.socketGateway.emitToGroup(groupId, 'balances:updated', { groupId });
    // Emit activity:new so ActivityTab updates live for all group members
    void this.emitActivityNew(groupId, created!._id.toString());

    return created!;
  }

  async getHistory(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    data: SettlementDocument[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const skip = (page - 1) * pageSize;
    const uid = new Types.ObjectId(userId);
    const filter = {
      $or: [{ fromUserId: uid }, { toUserId: uid }],
    };

    const [data, total] = await Promise.all([
      this.settlementModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .populate('fromUserId', 'name email')
        .populate('toUserId', 'name email')
        .exec(),
      this.settlementModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * Fetches the activity log entry for the given settlement, populates the
   * actor, fetches group member IDs, then emits 'activity:new' so the
   * ActivityTab updates in real time.
   */
  private async emitActivityNew(groupId: string, settlementId: string): Promise<void> {
    if (!this.socketGateway) return;
    try {
      const entry = await this.activityLogModel
        .findOne({
          groupId: new Types.ObjectId(groupId),
          entityId: new Types.ObjectId(settlementId),
          type: 'SETTLEMENT_RECORDED',
        })
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
