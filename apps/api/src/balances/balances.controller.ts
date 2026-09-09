import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { GroupMemberGuard } from '../groups/guards/group-member.guard.js';
import { BalancesService } from './balances.service.js';

@Controller('groups/:id/balances')
@UseGuards(JwtAuthGuard, GroupMemberGuard)
export class BalancesController {
  constructor(private readonly balancesService: BalancesService) {}

  @Get()
  getBalances(@Param('id') groupId: string) {
    return this.balancesService.getBalances(groupId);
  }

  @Get('simplified')
  getSimplified(@Param('id') groupId: string) {
    return this.balancesService.getSimplified(groupId);
  }
}
