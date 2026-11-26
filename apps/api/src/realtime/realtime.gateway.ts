import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { jsonBigIntReplacer } from '../common/utils/json-bigint';

interface JwtPayload {
  userId: string;
  role: string;
  adminRole?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  constructor(private readonly prisma: PrismaService) {}

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        this.logger.debug(`Client ${client.id} connected without token (anonymous)`);
        return;
      }

      const secret = process.env.JWT_ACCESS_SECRET || 'development_jwt_access_secret_key_minimum_32_characters_long_for_security';
      const decoded = jwt.verify(token, secret) as JwtPayload;

      // Attach user info to socket
      client.data.user = decoded;

      // Automatically join user room
      client.join(`user:${decoded.userId}`);

      // If admin, join admin room
      if (decoded.role === 'ADMIN') {
        client.join('admin');
      }

      this.logger.log(`Client authenticated: user=${decoded.userId}, role=${decoded.role}, socket=${client.id}`);
    } catch (err) {
      this.logger.warn(`Failed to authenticate socket ${client.id}: ${(err as Error).message}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:request')
  async handleJoinRequest(@ConnectedSocket() client: Socket, @MessageBody() data: { requestId: string }) {
    const user = client.data.user as JwtPayload | undefined;
    if (data?.requestId && user) {
      const allowed = user.role === 'ADMIN' || Boolean(await this.prisma.serviceRequest.findFirst({
        where: {
          id: data.requestId,
          OR: [{ customerId: user.userId }, { providerId: user.userId }],
        },
        select: { id: true },
      }));
      if (!allowed) return { success: false, error: 'Forbidden request room' };
      client.join(`request:${data.requestId}`);
      const [snapshot] = await this.prisma.$queryRaw<Array<{
        requestId: string;
        providerId: string;
        lat: number;
        lng: number;
        accuracy: number;
        heading: number | null;
        speed: number | null;
        recordedAt: Date;
        receivedAt: Date;
      }>>`
        SELECT sr.id AS "requestId", pl.provider_id AS "providerId",
          ST_Y(pl.location::geometry)::float AS lat,
          ST_X(pl.location::geometry)::float AS lng,
          pl.accuracy_m::float AS accuracy, pl.heading, pl.speed_mps AS speed,
          pl.recorded_at AS "recordedAt", pl.received_at AS "receivedAt"
        FROM service_requests sr
        JOIN provider_locations pl ON pl.provider_id=sr.provider_id
        WHERE sr.id=${data.requestId}::uuid`;
      if (snapshot) client.emit('provider.location', snapshot);
      this.logger.debug(`Socket ${client.id} joined room request:${data.requestId}`);
      return { success: true, room: `request:${data.requestId}` };
    }
    return { success: false, error: 'Invalid requestId' };
  }

  @SubscribeMessage('leave:request')
  handleLeaveRequest(@ConnectedSocket() client: Socket, @MessageBody() data: { requestId: string }) {
    if (data?.requestId) {
      client.leave(`request:${data.requestId}`);
      this.logger.debug(`Socket ${client.id} left room request:${data.requestId}`);
      return { success: true };
    }
    return { success: false };
  }

  // Helper emitter methods
  private serializable(payload: unknown) {
    return payload === undefined ? undefined : JSON.parse(JSON.stringify(payload, jsonBigIntReplacer));
  }
  emitOfferNew(providerId: string, payload: unknown) {
    this.server.to(`user:${providerId}`).emit('offer.new', this.serializable(payload));
  }

  emitOfferExpired(providerId: string, offerId: string) {
    this.server.to(`user:${providerId}`).emit('offer.expired', { offerId });
  }

  emitOfferCancelled(providerId: string, offerId: string) {
    this.server.to(`user:${providerId}`).emit('offer.cancelled', { offerId });
  }

  emitRequestUpdated(requestId: string, payload: unknown) {
    this.server.to(`request:${requestId}`).to('admin').emit('request.updated', this.serializable(payload));
  }

  emitProviderLocation(requestId: string, payload: unknown) {
    this.server.to(`request:${requestId}`).to('admin').emit('provider.location', this.serializable(payload));
  }

  emitRequestEta(requestId: string, etaSeconds: number) {
    this.server.to(`request:${requestId}`).emit('request.eta', { requestId, etaSeconds });
  }

  emitAdminAlert(type: string, requestId: string, message: string) {
    this.server.to('admin').emit('admin.alert', { type, requestId, message, timestamp: new Date().toISOString() });
  }

  emitProviderAvailability(providerId: string, state: string) {
    this.server.to('admin').emit('provider.availability', { providerId, state });
  }

  emitNotification(userId: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit('notification.new', this.serializable(payload));
  }
}
