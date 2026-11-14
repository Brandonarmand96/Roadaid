import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const transitions: Record<RequestStatus, RequestStatus[]> = {
  REQUESTED: [RequestStatus.SEARCHING, RequestStatus.CANCELLED],
  SEARCHING: [RequestStatus.ASSIGNED, RequestStatus.ESCALATED, RequestStatus.CANCELLED],
  ASSIGNED: [RequestStatus.EN_ROUTE, RequestStatus.CANCELLED],
  EN_ROUTE: [RequestStatus.ARRIVED, RequestStatus.CANCELLED],
  ARRIVED: [RequestStatus.IN_PROGRESS, RequestStatus.CANCELLED],
  IN_PROGRESS: [RequestStatus.COMPLETED, RequestStatus.CANCELLED],
  COMPLETED: [], CANCELLED: [],
  ESCALATED: [RequestStatus.SEARCHING, RequestStatus.ASSIGNED, RequestStatus.CANCELLED],
};

@Injectable()
export class RequestStateService {
  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeGateway) {}

  async transition(requestId: string, to: RequestStatus, actor: { type: string; id?: string }, payload: Prisma.InputJsonValue = {}) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: RequestStatus }>>`SELECT status FROM service_requests WHERE id=${requestId}::uuid FOR UPDATE`;
      const current = rows[0];
      if (!current) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found' });
      if (!transitions[current.status].includes(to)) throw new BadRequestException({ code: 'INVALID_REQUEST_TRANSITION', message: `Cannot transition from ${current.status} to ${to}` });
      const request = await tx.serviceRequest.update({ where: { id: requestId }, data: { status: to } });
      await tx.requestEvent.create({ data: { requestId, type: 'STATUS_CHANGED', actorType: actor.type, actorId: actor.id, payload: { ...payload as object, from: current.status, to } } });
      return request;
    });
    this.realtime.emitRequestUpdated(requestId, updated);
    return updated;
  }
}
