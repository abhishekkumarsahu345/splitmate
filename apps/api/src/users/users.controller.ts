import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UsersService } from './users.service.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  search(@Query('q') q: string, @Query('email') email: string) {
    // Support both ?q= (general search) and ?email= (exact match for AddMemberModal)
    const query = q || email || '';
    return this.usersService.searchByEmail(query);
  }
}
