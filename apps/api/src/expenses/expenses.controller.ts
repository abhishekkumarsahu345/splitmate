import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { GroupMemberGuard } from '../groups/guards/group-member.guard.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { ExpensesService } from './expenses.service.js';

// ── Personal cross-group expense history ──────────────────────────────────────
@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpenseHistoryController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get('history')
  getHistory(
    @Req() req: { user: { id: string } },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.expensesService.getHistory(req.user.id, page, pageSize);
  }
}

// ── Per-group expense CRUD ────────────────────────────────────────────────────
@Controller('groups/:id/expenses')
@UseGuards(JwtAuthGuard, GroupMemberGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  create(
    @Param('id') groupId: string,
    @Req() req: { user: { id: string } },
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expensesService.create(groupId, req.user.id, dto);
  }

  @Get()
  findAll(
    @Param('id') groupId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('sortBy', new DefaultValuePipe('date')) sortBy: 'date' | 'amount',
    @Query('sortOrder', new DefaultValuePipe('desc')) sortOrder: 'asc' | 'desc',
  ) {
    return this.expensesService.findAll(groupId, page, pageSize, sortBy, sortOrder);
  }

  @Patch(':expenseId')
  update(
    @Param('id') groupId: string,
    @Param('expenseId') expenseId: string,
    @Req() req: { user: { id: string } },
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(groupId, expenseId, req.user.id, dto);
  }

  @Delete(':expenseId')
  remove(
    @Param('id') groupId: string,
    @Param('expenseId') expenseId: string,
    @Req() req: { user: { id: string } },
  ) {
    return this.expensesService.remove(groupId, expenseId, req.user.id);
  }
}
