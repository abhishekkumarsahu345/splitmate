import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { GroupMemberGuard } from './guards/group-member.guard.js';
import { GroupOwnerGuard } from './guards/group-owner.guard.js';
import { GroupNameDto } from './dto/group-name.dto.js';
import { GroupsService } from './groups.service.js';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  create(@Req() req: any, @Body() body: GroupNameDto) {
    return this.groupsService.create(req.user.id, body.name);
  }

  @Get()
  findAll(@Req() req: any) {
    return this.groupsService.findAllForUser(req.user.id);
  }

  @Get(':id')
  @UseGuards(GroupMemberGuard)
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.groupsService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @UseGuards(GroupOwnerGuard)
  update(@Param('id') id: string, @Req() req: any, @Body() body: GroupNameDto) {
    return this.groupsService.update(id, req.user.id, body.name);
  }

  @Delete(':id')
  @UseGuards(GroupOwnerGuard)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.groupsService.remove(id, req.user.id);
  }

  @Post(':id/members')
  @UseGuards(GroupOwnerGuard)
  addMember(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { userId: string },
  ) {
    return this.groupsService.addMember(id, req.user.id, body.userId);
  }

  @Delete(':id/members/:userId')
  @UseGuards(GroupOwnerGuard)
  removeMember(
    @Param('id') id: string,
    @Req() req: any,
    @Param('userId') userId: string,
  ) {
    return this.groupsService.removeMember(id, req.user.id, userId);
  }
}
