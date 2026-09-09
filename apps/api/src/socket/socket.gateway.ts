import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { Server, Socket } from 'socket.io';
import { Membership, MembershipDocument } from '../groups/schemas/membership.schema.js';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },
})
export class SocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SocketGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectModel(Membership.name) private membershipModel: Model<MembershipDocument>,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        socket.emit('connect_error', { message: 'Unauthorized: no token' });
        socket.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      // Attach user info to socket for later use
      (socket as any).user = { id: payload.sub, email: payload.email };
      await socket.join(`user:${payload.sub}`);
      this.logger.log(`Socket connected: userId=${payload.sub}`);
    } catch {
      socket.emit('connect_error', { message: 'Unauthorized: invalid token' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    const user = (socket as any).user;
    if (user) this.logger.log(`Socket disconnected: userId=${user.id}`);
  }

  @SubscribeMessage('join:group')
  async handleJoinGroup(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    const user = (socket as any).user;
    if (!user) return;

    // Guard against invalid ObjectId values from the client
    if (!data?.groupId || !mongoose.isValidObjectId(data.groupId)) {
      this.logger.warn(`join:group rejected — invalid groupId from userId=${user.id}`);
      return;
    }

    try {
      const isMember = await this.membershipModel
        .exists({ userId: user.id, groupId: data.groupId })
        .exec();

      if (isMember) {
        await socket.join(`group:${data.groupId}`);
        this.logger.log(`userId=${user.id} joined group:${data.groupId}`);
      }
    } catch (err) {
      this.logger.error(`join:group error for userId=${user.id}: ${err}`);
    }
  }

  @SubscribeMessage('leave:group')
  async handleLeaveGroup(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    await socket.leave(`group:${data.groupId}`);
    const user = (socket as any).user;
    if (user) this.logger.log(`userId=${user.id} left group:${data.groupId}`);
  }

  // ─── Emission helpers called by services ───────────────────────────────────

  emitBalancesUpdated(groupId: string, payload: unknown): void {
    this.server?.to(`group:${groupId}`).emit('balances:updated', payload);
  }

  emitActivityNew(groupId: string, entry: unknown, memberIds: string[]): void {
    this.server?.to(`group:${groupId}`).emit('activity:new', entry);
    for (const uid of memberIds) {
      this.server?.to(`user:${uid}`).emit('activity:new', entry);
    }
  }

  /** Generic helper used internally by services */
  emitToGroup(groupId: string, event: string, payload: unknown): void {
    this.server?.to(`group:${groupId}`).emit(event, payload);
  }
}
