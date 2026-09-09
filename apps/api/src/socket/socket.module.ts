import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Membership, MembershipSchema } from '../groups/schemas/membership.schema.js';
import { SocketGateway } from './socket.gateway.js';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') as string,
        signOptions: { expiresIn: '900s' },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([{ name: Membership.name, schema: MembershipSchema }]),
  ],
  providers: [SocketGateway],
  exports: [SocketGateway],
})
export class SocketModule {}
