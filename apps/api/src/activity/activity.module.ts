import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ActivityLog, ActivityLogSchema } from './schemas/activity-log.schema.js';
import { ActivityService } from './activity.service.js';
import { ActivityController } from './activity.controller.js';
import { GroupsModule } from '../groups/groups.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ActivityLog.name, schema: ActivityLogSchema }]),
    PassportModule.register({}),
    forwardRef(() => GroupsModule),
  ],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService, MongooseModule],
})
export class ActivityModule {}
