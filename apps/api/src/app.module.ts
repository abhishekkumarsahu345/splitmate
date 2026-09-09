import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { GroupsModule } from './groups/groups.module.js';
import { ExpensesModule } from './expenses/expenses.module.js';
import { BalancesModule } from './balances/balances.module.js';
import { SettlementsModule } from './settlements/settlements.module.js';
import { ActivityModule } from './activity/activity.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { SocketModule } from './socket/socket.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    GroupsModule,
    ExpensesModule,
    BalancesModule,
    SettlementsModule,
    ActivityModule,
    DashboardModule,
    SocketModule,
  ],
})
export class AppModule {}
