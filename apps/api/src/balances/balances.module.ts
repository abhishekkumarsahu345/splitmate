import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Expense, ExpenseSchema } from '../expenses/schemas/expense.schema.js';
import { Settlement, SettlementSchema } from '../settlements/schemas/settlement.schema.js';
import { Membership, MembershipSchema } from '../groups/schemas/membership.schema.js';
import { GroupsModule } from '../groups/groups.module.js';
import { BalancesController } from './balances.controller.js';
import { BalancesService } from './balances.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Expense.name, schema: ExpenseSchema },
      { name: Settlement.name, schema: SettlementSchema },
      { name: Membership.name, schema: MembershipSchema },
    ]),
    PassportModule.register({}),
    forwardRef(() => GroupsModule),
  ],
  controllers: [BalancesController],
  providers: [BalancesService],
  exports: [BalancesService],
})
export class BalancesModule {}
