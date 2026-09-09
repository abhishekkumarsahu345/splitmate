import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { GroupMemberGuard } from '../groups/guards/group-member.guard.js';
import { CreateSettlementDto } from './dto/create-settlement.dto.js';
import { SettlementsService } from './settlements.service.js';

@Controller()
@UseGuards(JwtAuthGuard)
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Post('groups/:id/settlements')
  @UseGuards(GroupMemberGuard)
  create(
    @Param('id') groupId: string,
    @Req() req: any,
    @Body() dto: CreateSettlementDto,
  ) {
    return this.settlementsService.create(groupId, req.user.id, dto);
  }

  @Get('settlements/history')
  getHistory(
    @Req() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.settlementsService.getHistory(req.user.id, page, pageSize);
  }
}
