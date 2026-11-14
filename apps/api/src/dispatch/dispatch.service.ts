import { ConflictException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OfferStatus, ProviderAvailability, RequestStatus, ServiceType } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RequestStateService } from '../requests/request-state.service';
import { NotificationsService } from '../notifications/notifications.service';

type LockedRequest = { id: string; status: RequestStatus; service_type: ServiceType; offers_made_count: number; search_started_at: Date; dispatch_round: number };
type Candidate = { user_id: string; dist_m: number; completed_jobs: number };

@Injectable()
export class DispatchService implements OnModuleInit, OnModuleDestroy {
  private connection?: IORedis;
  private nextQueue?: Queue;
  private expiryQueue?: Queue;
  private workers: Worker[] = [];
  private sweepTimer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeGateway, private readonly states: RequestStateService, private readonly notifications: NotificationsService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });
    this.nextQueue = new Queue('dispatch-next', { connection: this.connection });
    this.expiryQueue = new Queue('offer-expire', { connection: this.connection });
    this.workers = [
      new Worker('dispatch-next', (job) => this.dispatchNext(job.data.requestId), { connection: this.connection }),
      new Worker('offer-expire', (job) => this.expireOffer(job.data.offerId), { connection: this.connection }),
    ];
    this.sweepTimer = setInterval(() => void this.sweep(), 15_000);
  }

  async onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all([this.nextQueue?.close(), this.expiryQueue?.close()]);
    await this.connection?.quit();
  }

  async start(requestId: string) {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceRequest.updateMany({ where: { id: requestId, status: RequestStatus.REQUESTED }, data: { status: RequestStatus.SEARCHING, searchStartedAt: new Date() } });
      if (updated.count) await tx.requestEvent.create({ data: { requestId, type: 'STATUS_CHANGED', actorType: 'SYSTEM', payload: { from: 'REQUESTED', to: 'SEARCHING' } } });
    });
    await this.enqueueNext(requestId, 0);
  }

  async enqueueNext(requestId: string, count: number, delay = 0) {
    if (!this.nextQueue) return;
    await this.nextQueue.add('dispatch:next', { requestId }, { jobId: `dispatch-next-${requestId}-${count}`, delay, removeOnComplete: true, removeOnFail: 100 });
  }

  async dispatchNext(requestId: string) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedRequest[]>`
        SELECT id, status, service_type, offers_made_count, search_started_at, dispatch_round
        FROM service_requests WHERE id=${requestId}::uuid FOR UPDATE`;
      const request = rows[0];
      if (!request || request.status !== RequestStatus.SEARCHING) return null;
      const settings = await tx.dispatchSettings.findUnique({ where: { serviceType: request.service_type } });
      if (!settings) return this.escalateTx(tx, requestId, 'DISPATCH_SETTINGS_MISSING');
      if (Date.now() - request.search_started_at.getTime() > settings.maxSearchDurationSeconds * 1000) return this.escalateTx(tx, requestId, 'SEARCH_TIMEOUT');
      if (await tx.dispatchOffer.count({ where: { requestId, status: OfferStatus.PENDING } })) return null;
      if (request.offers_made_count >= settings.maxOffers) return this.escalateTx(tx, requestId, 'MAX_OFFERS_REACHED');
      const candidates = await tx.$queryRaw<Candidate[]>`
        SELECT pp.user_id, ST_Distance(pl.location, sr.pickup_location)::float AS dist_m, pp.completed_jobs
        FROM service_requests sr
        JOIN provider_profiles pp ON true
        JOIN provider_services ps ON ps.provider_id=pp.user_id AND ps.service_type=sr.service_type AND ps.status='APPROVED'
        JOIN users u ON u.id=pp.user_id AND u.status='ACTIVE'
        JOIN provider_locations pl ON pl.provider_id=pp.user_id
        WHERE sr.id=${requestId}::uuid AND pp.onboarding_status='APPROVED' AND pp.availability='ONLINE' AND pp.current_request_id IS NULL
          AND pl.received_at > now() - make_interval(secs => ${settings.staleLocationSeconds})
          AND ST_DWithin(pl.location, sr.pickup_location, ${settings.searchRadiusKm * 1000})
          AND NOT EXISTS (SELECT 1 FROM dispatch_offers o WHERE o.request_id=sr.id AND o.provider_id=pp.user_id AND o.round=${request.dispatch_round})
        ORDER BY ST_Distance(pl.location, sr.pickup_location), pp.completed_jobs, pp.user_id
        LIMIT ${settings.candidateShortlistSize}
        FOR UPDATE OF pp SKIP LOCKED`;
      if (!candidates.length) {
        const visibleEligible = await tx.$queryRaw<Array<{ count: bigint }>>`
          SELECT count(*) FROM service_requests sr JOIN provider_services ps ON ps.service_type=sr.service_type AND ps.status='APPROVED'
          JOIN provider_profiles pp ON pp.user_id=ps.provider_id AND pp.onboarding_status='APPROVED' AND pp.availability='ONLINE' AND pp.current_request_id IS NULL
          JOIN provider_locations pl ON pl.provider_id=pp.user_id
          JOIN users u ON u.id=pp.user_id AND u.status='ACTIVE'
          WHERE sr.id=${requestId}::uuid AND pl.received_at > now() - make_interval(secs => ${settings.staleLocationSeconds})
          AND ST_DWithin(pl.location, sr.pickup_location, ${settings.searchRadiusKm * 1000})`;
        if (Number(visibleEligible[0]?.count || 0) > 0) return { kind: 'retry' as const, count: request.offers_made_count };
        return this.escalateTx(tx, requestId, 'NO_ELIGIBLE_PROVIDER');
      }
      const best = candidates.map((candidate) => ({ ...candidate, eta: Math.max(60, Math.round(Number(candidate.dist_m) / 8.3)) })).sort((a, b) => a.eta - b.eta || Number(a.dist_m) - Number(b.dist_m) || a.completed_jobs - b.completed_jobs)[0];
      const expiresAt = new Date(Date.now() + settings.offerTimeoutSeconds * 1000);
      const offer = await tx.dispatchOffer.create({ data: { requestId, providerId: best.user_id, sequenceNo: request.offers_made_count + 1, expiresAt, distanceMAtOffer: Number(best.dist_m), etaSecondsAtOffer: best.eta, round: request.dispatch_round } });
      const reserved = await tx.providerProfile.updateMany({ where: { userId: best.user_id, availability: ProviderAvailability.ONLINE, currentRequestId: null }, data: { availability: ProviderAvailability.RESERVED } });
      if (reserved.count !== 1) throw new ConflictException('Provider was reserved concurrently');
      await tx.serviceRequest.update({ where: { id: requestId }, data: { currentOfferId: offer.id, offersMadeCount: { increment: 1 } } });
      await tx.requestEvent.create({ data: { requestId, type: 'OFFER_SENT', actorType: 'SYSTEM', payload: { offerId: offer.id, providerId: best.user_id, expiresAt: expiresAt.toISOString(), sequenceNo: offer.sequenceNo } } });
      return { kind: 'offer' as const, offer, providerId: best.user_id, count: offer.sequenceNo };
    });
    if (!outcome) return;
    if (outcome.kind === 'escalated') { this.realtime.emitAdminAlert('NO_PROVIDER', requestId, 'No eligible provider accepted this request'); this.realtime.emitRequestUpdated(requestId, { status: RequestStatus.ESCALATED }); return; }
    if (outcome.kind === 'retry') { await this.enqueueNext(requestId, outcome.count, 250); return; }
    const delay = Math.max(0, outcome.offer.expiresAt.getTime() - Date.now() + 1000);
    await this.expiryQueue?.add('offer:expire', { offerId: outcome.offer.id }, { delay, jobId: `offer-expire-${outcome.offer.id}`, removeOnComplete: true });
    this.realtime.emitOfferNew(outcome.providerId, outcome.offer);
    this.realtime.emitRequestUpdated(requestId, { status: RequestStatus.SEARCHING, currentOfferId: outcome.offer.id });
    await this.notifications.send(outcome.providerId, { title: 'New RoadAid offer', body: 'A nearby customer needs roadside assistance.', data: { type: 'OFFER_NEW', offerId: outcome.offer.id, requestId }, channel: 'offers', priority: 'high' });
  }

  private async escalateTx(tx: any, requestId: string, reason: string) {
    await tx.serviceRequest.update({ where: { id: requestId }, data: { status: RequestStatus.ESCALATED, escalatedAt: new Date(), currentOfferId: null } });
    await tx.requestEvent.create({ data: { requestId, type: 'ESCALATED', actorType: 'SYSTEM', payload: { reason } } });
    return { kind: 'escalated' as const };
  }

  async expireOffer(offerId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; request_id: string; provider_id: string; status: OfferStatus }>>`SELECT id, request_id, provider_id, status FROM dispatch_offers WHERE id=${offerId}::uuid FOR UPDATE`;
      const offer = rows[0]; if (!offer || offer.status !== OfferStatus.PENDING) return null;
      await tx.dispatchOffer.update({ where: { id: offerId }, data: { status: OfferStatus.EXPIRED, respondedAt: new Date() } });
      await tx.providerProfile.updateMany({ where: { userId: offer.provider_id, availability: ProviderAvailability.RESERVED }, data: { availability: ProviderAvailability.ONLINE } });
      const request = await tx.serviceRequest.update({ where: { id: offer.request_id }, data: { currentOfferId: null } });
      await tx.requestEvent.create({ data: { requestId: offer.request_id, type: 'OFFER_EXPIRED', actorType: 'SYSTEM', payload: { offerId } } });
      return { ...offer, count: request.offersMadeCount };
    });
    if (!result) return;
    this.realtime.emitOfferExpired(result.provider_id, offerId);
    await this.enqueueNext(result.request_id, result.count);
  }

  async respond(providerId: string, offerId: string, accept: boolean, reason?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; request_id: string; provider_id: string; status: OfferStatus; expires_at: Date }>>`SELECT id, request_id, provider_id, status, expires_at FROM dispatch_offers WHERE id=${offerId}::uuid AND provider_id=${providerId}::uuid FOR UPDATE`;
      const offer = rows[0];
      if (!offer || offer.status !== OfferStatus.PENDING || offer.expires_at.getTime() <= Date.now()) throw new ConflictException({ code: 'OFFER_NO_LONGER_AVAILABLE', message: 'This offer is no longer available' });
      const requests = await tx.$queryRaw<Array<{ status: RequestStatus }>>`SELECT status FROM service_requests WHERE id=${offer.request_id}::uuid FOR UPDATE`;
      if (requests[0]?.status !== RequestStatus.SEARCHING) throw new ConflictException({ code: 'REQUEST_NO_LONGER_SEARCHING', message: 'Request is no longer searching' });
      const provider = await tx.providerProfile.findUnique({ where: { userId: providerId } });
      if (provider?.currentRequestId) throw new ConflictException({ code: 'PROVIDER_BUSY', message: 'Provider already has an active job' });
      if (!accept) {
        await tx.dispatchOffer.update({ where: { id: offerId }, data: { status: OfferStatus.DECLINED, respondedAt: new Date(), declineReason: reason } });
        await tx.providerProfile.updateMany({ where: { userId: providerId, availability: ProviderAvailability.RESERVED }, data: { availability: ProviderAvailability.ONLINE } });
        const request = await tx.serviceRequest.update({ where: { id: offer.request_id }, data: { currentOfferId: null } });
        await tx.requestEvent.create({ data: { requestId: offer.request_id, type: 'OFFER_DECLINED', actorType: 'PROVIDER', actorId: providerId, payload: { offerId, reason } } });
        return { accepted: false, requestId: offer.request_id, count: request.offersMadeCount };
      }
      await tx.dispatchOffer.update({ where: { id: offerId }, data: { status: OfferStatus.ACCEPTED, respondedAt: new Date() } });
      const request = await tx.serviceRequest.update({ where: { id: offer.request_id }, data: { status: RequestStatus.ASSIGNED, providerId, acceptedAt: new Date(), currentOfferId: offerId } });
      await tx.providerProfile.update({ where: { userId: providerId }, data: { availability: ProviderAvailability.BUSY, currentRequestId: offer.request_id } });
      await tx.requestEvent.create({ data: { requestId: offer.request_id, type: 'ASSIGNED', actorType: 'PROVIDER', actorId: providerId, payload: { offerId } } });
      return { accepted: true, requestId: offer.request_id, request };
    });
    const job = await this.expiryQueue?.getJob(`offer-expire-${offerId}`); await job?.remove().catch(() => undefined);
    if (!result.accepted) { await this.enqueueNext(result.requestId, result.count); return result; }
    this.realtime.emitRequestUpdated(result.requestId, result.request);
    await this.notifications.send(result.request.customerId, { title: 'Provider assigned', body: 'A verified provider accepted your RoadAid request.', data: { type: 'REQUEST_ASSIGNED', requestId: result.requestId }, priority: 'high' });
    return result;
  }

  pendingOffers(providerId: string) { return this.prisma.dispatchOffer.findMany({ where: { providerId, status: OfferStatus.PENDING, expiresAt: { gt: new Date() } }, include: { request: true }, orderBy: { offeredAt: 'desc' } }); }

  currentJob(providerId: string) {
    return this.prisma.serviceRequest.findFirst({
      where: { providerId, status: { in: [RequestStatus.ASSIGNED, RequestStatus.EN_ROUTE, RequestStatus.ARRIVED, RequestStatus.IN_PROGRESS] } },
      include: { customer: { select: { fullName: true, phone: true } }, events: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async updateJobStatus(providerId: string, requestId: string, to: RequestStatus) {
    const request = await this.prisma.serviceRequest.findFirst({ where: { id: requestId, providerId } });
    if (!request) throw new ConflictException({ code: 'JOB_NOT_ASSIGNED', message: 'This job is not assigned to you' });
    if (!(new Set<RequestStatus>([RequestStatus.EN_ROUTE, RequestStatus.ARRIVED, RequestStatus.IN_PROGRESS, RequestStatus.COMPLETED])).has(to)) throw new ConflictException({ code: 'INVALID_PROVIDER_STATUS', message: 'Provider cannot set this request status' });
    return this.states.transition(requestId, to, { type: 'PROVIDER', id: providerId });
  }

  async cancelAcceptedJob(providerId: string, requestId: string, reason: string) {
    const resumed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: RequestStatus; provider_id: string | null; offers_made_count: number }>>`
        SELECT status, provider_id, offers_made_count FROM service_requests WHERE id=${requestId}::uuid FOR UPDATE`;
      const request = rows[0];
      const cancellable = new Set<RequestStatus>([RequestStatus.ASSIGNED, RequestStatus.EN_ROUTE, RequestStatus.ARRIVED, RequestStatus.IN_PROGRESS]);
      if (!request || request.provider_id !== providerId || !cancellable.has(request.status)) throw new ConflictException({ code: 'JOB_NOT_CANCELLABLE', message: 'This active job cannot be cancelled by this provider' });
      await tx.$executeRaw`UPDATE service_requests SET status='SEARCHING', provider_id=NULL, current_offer_id=NULL, accepted_at=NULL, arrived_at=NULL, started_at=NULL, search_started_at=now(), updated_at=now() WHERE id=${requestId}::uuid`;
      await tx.providerProfile.updateMany({ where: { userId: providerId, currentRequestId: requestId }, data: { currentRequestId: null, availability: ProviderAvailability.ONLINE } });
      await tx.requestEvent.create({ data: { requestId, type: 'CANCELLED', actorType: 'PROVIDER', actorId: providerId, payload: { reason, previousStatus: request.status, action: 'RETURNED_TO_SEARCH' } } });
      return request.offers_made_count;
    });
    this.realtime.emitRequestUpdated(requestId, { status: RequestStatus.SEARCHING, providerId: null });
    await this.enqueueNext(requestId, resumed);
    return { requestId, status: RequestStatus.SEARCHING };
  }

  async sweep() {
    const expired = await this.prisma.dispatchOffer.findMany({ where: { status: OfferStatus.PENDING, expiresAt: { lt: new Date(Date.now() - 3000) } }, select: { id: true } });
    for (const offer of expired) await this.expireOffer(offer.id).catch(() => undefined);
    await this.prisma.$executeRaw`UPDATE provider_profiles pp SET availability='ONLINE', updated_at=now() WHERE availability='RESERVED' AND NOT EXISTS (SELECT 1 FROM dispatch_offers o WHERE o.provider_id=pp.user_id AND o.status='PENDING')`;
    await this.prisma.$executeRaw`UPDATE provider_profiles pp SET availability='OFFLINE', updated_at=now() FROM provider_locations pl WHERE pl.provider_id=pp.user_id AND pp.current_request_id IS NULL AND pp.availability IN ('ONLINE','UNAVAILABLE') AND pl.received_at < now() - interval '15 minutes'`;
    const stalled = await this.prisma.serviceRequest.findMany({ where: { status: RequestStatus.SEARCHING, currentOfferId: null, updatedAt: { lt: new Date(Date.now() - 20_000) } }, select: { id: true, offersMadeCount: true } });
    for (const request of stalled) await this.enqueueNext(request.id, request.offersMadeCount);
  }

  async redispatch(requestId: string, adminId: string) {
    const round = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: RequestStatus; dispatch_round: number }>>`SELECT status, dispatch_round FROM service_requests WHERE id=${requestId}::uuid FOR UPDATE`;
      const request = rows[0];
      if (!request || request.status !== RequestStatus.ESCALATED) throw new ConflictException({ code: 'REQUEST_NOT_ESCALATED', message: 'Only escalated requests can be re-dispatched' });
      const nextRound = request.dispatch_round + 1;
      await tx.$executeRaw`UPDATE service_requests SET status='SEARCHING', dispatch_round=${nextRound}, offers_made_count=0, current_offer_id=NULL, search_started_at=now(), escalated_at=NULL, updated_at=now() WHERE id=${requestId}::uuid`;
      await tx.requestEvent.create({ data: { requestId, type: 'ADMIN_ACTION', actorType: 'ADMIN', actorId: adminId, payload: { action: 'REDISPATCH', round: nextRound } } });
      return nextRound;
    });
    await this.enqueueNext(requestId, 0);
    this.realtime.emitRequestUpdated(requestId, { status: RequestStatus.SEARCHING, dispatchRound: round });
    return { requestId, status: RequestStatus.SEARCHING, dispatchRound: round };
  }

  eligibleProviders(requestId: string) {
    return this.prisma.$queryRaw<Array<{ userId: string; fullName: string | null; phone: string; distanceM: number }>>`
      SELECT pp.user_id AS "userId", u.full_name AS "fullName", u.phone, ST_Distance(pl.location, sr.pickup_location)::float AS "distanceM"
      FROM service_requests sr
      JOIN provider_services ps ON ps.service_type=sr.service_type AND ps.status='APPROVED'
      JOIN provider_profiles pp ON pp.user_id=ps.provider_id AND pp.onboarding_status='APPROVED' AND pp.availability='ONLINE' AND pp.current_request_id IS NULL
      JOIN provider_locations pl ON pl.provider_id=pp.user_id AND pl.received_at > now() - interval '90 seconds'
      JOIN users u ON u.id=pp.user_id AND u.status='ACTIVE'
      WHERE sr.id=${requestId}::uuid ORDER BY ST_Distance(pl.location, sr.pickup_location) LIMIT 50`;
  }

  async manualAssign(requestId: string, providerId: string, adminId: string) {
    const assigned = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: RequestStatus; service_type: ServiceType; dispatch_round: number }>>`SELECT status, service_type, dispatch_round FROM service_requests WHERE id=${requestId}::uuid FOR UPDATE`;
      const request = rows[0];
      if (!request || !(new Set<RequestStatus>([RequestStatus.ESCALATED, RequestStatus.SEARCHING])).has(request.status)) throw new ConflictException({ code: 'REQUEST_NOT_ASSIGNABLE', message: 'Request cannot be manually assigned' });
      const providers = await tx.$queryRaw<Array<{ user_id: string }>>`
        SELECT pp.user_id FROM provider_profiles pp JOIN provider_services ps ON ps.provider_id=pp.user_id
        JOIN users u ON u.id=pp.user_id WHERE pp.user_id=${providerId}::uuid AND pp.onboarding_status='APPROVED'
        AND pp.availability='ONLINE' AND pp.current_request_id IS NULL AND ps.service_type=${request.service_type}::"ServiceType" AND ps.status='APPROVED' AND u.status='ACTIVE' FOR UPDATE OF pp`;
      if (!providers.length) throw new ConflictException({ code: 'PROVIDER_NOT_ELIGIBLE', message: 'Provider is no longer eligible or available' });
      await tx.dispatchOffer.updateMany({ where: { requestId, status: OfferStatus.PENDING }, data: { status: OfferStatus.CANCELLED, respondedAt: new Date() } });
      const offer = await tx.dispatchOffer.create({ data: { requestId, providerId, sequenceNo: 1, round: request.dispatch_round, status: OfferStatus.ACCEPTED, offeredAt: new Date(), expiresAt: new Date(), respondedAt: new Date() } });
      const updated = await tx.serviceRequest.update({ where: { id: requestId }, data: { status: RequestStatus.ASSIGNED, providerId, currentOfferId: offer.id, acceptedAt: new Date() } });
      await tx.providerProfile.update({ where: { userId: providerId }, data: { availability: ProviderAvailability.BUSY, currentRequestId: requestId } });
      await tx.requestEvent.create({ data: { requestId, type: 'ADMIN_ACTION', actorType: 'ADMIN', actorId: adminId, payload: { action: 'MANUAL_ASSIGN', providerId, offerId: offer.id } } });
      return updated;
    });
    this.realtime.emitRequestUpdated(requestId, assigned);
    return assigned;
  }
}
