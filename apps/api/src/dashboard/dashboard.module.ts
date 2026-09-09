import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ActivityLog, ActivityLogSchema } from '../activity/schemas/activity-log.schema.js';
import { Expense, ExpenseSchema } from '../expenses/schemas/expense.schema.js';
import { Group, GroupSchema } from '../groups/schemas/group.schema.js';
import { Settlement, SettlementSchema } from '../settlements/schemas/settlement.schema.js';
import { Membership, MembershipSchema } from '../groups/schemas/membership.schema.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [
    PassportModule.register({}),
    MongooseModule.forFeature([
      { name: Expense.name, schema: ExpenseSchema },
      { name: Group.name, schema: GroupSchema },
      { name: Settlement.name, schema: SettlementSchema },
      { name: Membership.name, schema: MembershipSchema },
      { name: ActivityLog.name, schema: ActivityLogSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
