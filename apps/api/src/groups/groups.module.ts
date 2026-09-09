import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Group, GroupSchema } from './schemas/group.schema.js';
import { Membership, MembershipSchema } from './schemas/membership.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { Expense, ExpenseSchema } from '../expenses/schemas/expense.schema.js';
import { Settlement, SettlementSchema } from '../settlements/schemas/settlement.schema.js';
import { ActivityLog, ActivityLogSchema } from '../activity/schemas/activity-log.schema.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';
import { GroupMemberGuard } from './guards/group-member.guard.js';
import { GroupOwnerGuard } from './guards/group-owner.guard.js';
import { ActivityModule } from '../activity/activity.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Group.name, schema: GroupSchema },
      { name: Membership.name, schema: MembershipSchema },
      { name: User.name, schema: UserSchema },
      { name: Expense.name, schema: ExpenseSchema },
      { name: Settlement.name, schema: SettlementSchema },
      { name: ActivityLog.name, schema: ActivityLogSchema },
    ]),
    forwardRef(() => ActivityModule),
    PassportModule.register({}),
  ],
  controllers: [GroupsController],
  providers: [GroupsService, GroupMemberGuard, GroupOwnerGuard],
  exports: [GroupsService, GroupMemberGuard, GroupOwnerGuard, MongooseModule],
})
export class GroupsModule {}
