import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ActivityModule } from '../activity/activity.module.js';
import { ActivityLog, ActivityLogSchema } from '../activity/schemas/activity-log.schema.js';
import { BalancesModule } from '../balances/balances.module.js';
import { Membership, MembershipSchema } from '../groups/schemas/membership.schema.js';
import { GroupsModule } from '../groups/groups.module.js';
import { SocketModule } from '../socket/socket.module.js';
import { Settlement, SettlementSchema } from './schemas/settlement.schema.js';
import { SettlementsController } from './settlements.controller.js';
import { SettlementsService } from './settlements.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Settlement.name, schema: SettlementSchema },
      { name: Membership.name, schema: MembershipSchema },
      { name: ActivityLog.name, schema: ActivityLogSchema },
    ]),
    ActivityModule,
    BalancesModule,
    PassportModule.register({}),
    forwardRef(() => GroupsModule),
    forwardRef(() => SocketModule),
  ],
  controllers: [SettlementsController],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
