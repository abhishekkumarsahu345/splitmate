import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Expense, ExpenseSchema } from './schemas/expense.schema.js';
import { Membership, MembershipSchema } from '../groups/schemas/membership.schema.js';
import { Group, GroupSchema } from '../groups/schemas/group.schema.js';
import { ActivityLog, ActivityLogSchema } from '../activity/schemas/activity-log.schema.js';
import { ActivityModule } from '../activity/activity.module.js';
import { SocketModule } from '../socket/socket.module.js';
import { GroupsModule } from '../groups/groups.module.js';
import { ExpensesService } from './expenses.service.js';
import { ExpensesController, ExpenseHistoryController } from './expenses.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Expense.name, schema: ExpenseSchema },
      { name: Membership.name, schema: MembershipSchema },
      { name: Group.name, schema: GroupSchema },
      { name: ActivityLog.name, schema: ActivityLogSchema },
    ]),
    ActivityModule,
    PassportModule.register({}),
    forwardRef(() => SocketModule),
    forwardRef(() => GroupsModule),
  ],
  providers: [ExpensesService],
  controllers: [ExpensesController, ExpenseHistoryController],
  exports: [ExpensesService, MongooseModule],
})
export class ExpensesModule {}
