import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { GroupMemberGuard } from '../groups/guards/group-member.guard.js';
import { ActivityService } from './activity.service.js';

@Controller('groups/:id/activity')
@UseGuards(JwtAuthGuard, GroupMemberGuard)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  getActivity(
    @Param('id') groupId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.activityService.getForGroup(groupId, page, pageSize);
  }
}
