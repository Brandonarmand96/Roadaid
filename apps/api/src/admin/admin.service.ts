import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.interface';
import {
  OnboardingStatus,
  ApprovalStatus,
  ServiceType,
  ProviderAvailability,
} from '@roadaid/shared';
import { DispatchSettingsDto, PricingRuleDto } from '@roadaid/shared';
import { DispatchService } from '../dispatch/dispatch.service';
import { RequestStateService } from '../requests/request-state.service';
import { PaymentsService } from '../payments/payments.service';
import { WalletService } from '../wallet/wallet.service';
import { PaymentStatus, PayoutStatus, RequestStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject('STORAGE_SERVICE') private readonly storage: StorageService,
    private readonly dispatch: DispatchService,
    private readonly states: RequestStateService,
    private readonly paymentsService: PaymentsService,
    private readonly walletService: WalletService,
  ) {}

  async getProviders(filters: { status?: OnboardingStatus; service?: ServiceType; q?: string }) {
    const where: any = {};

    if (filters.status) {
      where.onboardingStatus = filters.status;
    }

    if (filters.service) {
      where.services = {
        some: {
          serviceType: filters.service,
        },
      };
    }

    if (filters.q) {
      where.OR = [
        { businessName: { contains: filters.q, mode: 'insensitive' } },
        { user: { phone: { contains: filters.q } } },
        { user: { fullName: { contains: filters.q, mode: 'insensitive' } } },
      ];
    }

    return this.prisma.providerProfile.findMany({
      where,
      include: {
        user: {
          select: { id: true, phone: true, email: true, fullName: true, status: true },
        },
        services: true,
        documents: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  getPricingRules() {
    return this.prisma.pricingRule.findMany({ orderBy: { serviceType: 'asc' } });
  }

  getDispatchSettings() { return this.prisma.dispatchSettings.findMany({ orderBy: { serviceType: 'asc' } }); }

  async updateDispatchSettings(serviceType: ServiceType, dto: DispatchSettingsDto, adminId: string, adminRole: string, ip?: string) {
    const before = await this.prisma.dispatchSettings.findUnique({ where: { serviceType } });
    if (!before) throw new NotFoundException({ code: 'DISPATCH_SETTINGS_NOT_FOUND', message: 'Dispatch settings not found' });
    const after = await this.prisma.dispatchSettings.update({ where: { serviceType }, data: { ...dto, updatedBy: adminId } });
    await this.auditService.log({ actorId: adminId, actorRole: adminRole, action: 'DISPATCH_SETTINGS_UPDATED', entityType: 'DISPATCH_SETTINGS', entityId: after.id, before, after, ip });
    return after;
  }

  async updatePricingRule(serviceType: ServiceType, dto: PricingRuleDto, adminId: string, adminRole: string, ip?: string) {
    const before = await this.prisma.pricingRule.findUnique({ where: { serviceType } });
    if (!before) throw new NotFoundException({ code: 'PRICING_RULE_NOT_FOUND', message: 'Pricing rule not found' });
    const after = await this.prisma.pricingRule.update({
      where: { serviceType },
      data: { ...dto, baseKobo: BigInt(dto.baseKobo), perKmKobo: BigInt(dto.perKmKobo), perLitreKobo: BigInt(dto.perLitreKobo), minKobo: BigInt(dto.minKobo), updatedBy: adminId },
    });
    await this.auditService.log({ actorId: adminId, actorRole: adminRole, action: 'PRICING_RULE_UPDATED', entityType: 'PRICING_RULE', entityId: after.id, before, after, ip });
    return after;
  }

  async getRequests(status?: string, serviceType?: ServiceType) {
    const requests = await this.prisma.serviceRequest.findMany({
      where: { ...(status ? { status: status as any } : {}), ...(serviceType ? { serviceType } : {}) },
      include: { customer: { select: { id: true, phone: true, fullName: true } }, provider: { select: { id: true, phone: true, fullName: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
    return requests.map((request) => this.withoutRequestSecrets(request));
  }

  async getRequestDetail(id: string) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id }, include: { customer: { select: { id: true, phone: true, fullName: true } }, provider: { select: { id: true, phone: true, fullName: true } }, events: { orderBy: { createdAt: 'asc' } } } });
    if (!request) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found' });
    return this.withoutRequestSecrets(request);
  }

  private withoutRequestSecrets<T extends { pickupPinHash?: string | null; pickupPinEncrypted?: string | null; shareToken?: string | null }>(request: T) {
    const safe = { ...request };
    delete safe.pickupPinHash;
    delete safe.pickupPinEncrypted;
    delete safe.shareToken;
    return safe;
  }

  getSupportCases(status?: string) {
    return this.prisma.supportCase.findMany({
      where: status ? { status } : undefined,
      include: { user: { select: { id: true, fullName: true, phone: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async updateSupportCase(id: string, status: string, adminId: string, adminRole: string, ip?: string) {
    if (!['OPEN', 'IN_PROGRESS', 'RESOLVED'].includes(status))
      throw new BadRequestException({ code: 'INVALID_SUPPORT_STATUS', message: 'Status must be OPEN, IN_PROGRESS or RESOLVED' });
    const before = await this.prisma.supportCase.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: 'SUPPORT_CASE_NOT_FOUND', message: 'Support case not found' });
    const after = await this.prisma.supportCase.update({ where: { id }, data: { status } });
    await this.auditService.log({ actorId: adminId, actorRole: adminRole, action: 'SUPPORT_CASE_STATUS_UPDATED', entityType: 'SUPPORT_CASE', entityId: id, before, after, ip });
    return after;
  }

  redispatchRequest(id: string, adminId: string) { return this.dispatch.redispatch(id, adminId); }
  eligibleProviders(id: string) { return this.dispatch.eligibleProviders(id); }
  manualAssign(id: string, providerId: string, adminId: string) { return this.dispatch.manualAssign(id, providerId, adminId); }
  cancelRequest(id: string, reason: string, adminId: string) { return this.states.cancel(id, { type: 'ADMIN', id: adminId }, reason); }

  async getProviderDetail(providerId: string) {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { userId: providerId },
      include: {
        user: {
          select: { id: true, phone: true, email: true, fullName: true, status: true, lastLoginAt: true },
        },
        services: true,
        documents: true,
        bankAccounts: true,
      },
    });

    if (!provider) {
      throw new NotFoundException({
        code: 'PROVIDER_NOT_FOUND',
        message: 'Provider not found',
      });
    }

    // Attach signed URLs for private documents (5 min expiry)
    const docsWithSignedUrls = await Promise.all(
      provider.documents.map(async (doc) => {
        const signedUrl = await this.storage.getSignedUrl(doc.storageKey, 300, {
          mimeType: doc.mimeType,
          filename: doc.docType.toLowerCase(),
        });
        return {
          ...doc,
          signedUrl,
        };
      }),
    );

    return {
      ...provider,
      documents: docsWithSignedUrls,
    };
  }

  async setProviderStatus(
    providerId: string,
    status: OnboardingStatus,
    reason: string | undefined,
    adminId: string,
    adminRole: string,
    ip?: string,
  ) {
    const before = await this.prisma.providerProfile.findUnique({ where: { userId: providerId } });
    if (!before) throw new NotFoundException('Provider not found');

    const updateData: any = {
      onboardingStatus: status,
      reviewedBy: adminId,
      reviewedAt: new Date(),
    };

    if (status === OnboardingStatus.REJECTED) {
      updateData.rejectionReason = reason || 'Requirements not met';
      updateData.availability = ProviderAvailability.OFFLINE;
    } else if (status === OnboardingStatus.SUSPENDED) {
      updateData.rejectionReason = reason || 'Suspended by operations';
      updateData.availability = ProviderAvailability.OFFLINE;
    } else if (status === OnboardingStatus.APPROVED) {
      updateData.rejectionReason = null;
    }

    const after = await this.prisma.providerProfile.update({
      where: { userId: providerId },
      data: updateData,
    });

    await this.auditService.log({
      actorId: adminId,
      actorRole: adminRole,
      action: `PROVIDER_${status}`,
      entityType: 'PROVIDER_PROFILE',
      entityId: providerId,
      before: { onboardingStatus: before.onboardingStatus, rejectionReason: before.rejectionReason },
      after: { onboardingStatus: after.onboardingStatus, rejectionReason: after.rejectionReason },
      ip,
    });

    return after;
  }

  async setProviderServiceStatus(
    providerId: string,
    serviceType: ServiceType,
    status: ApprovalStatus,
    reason: string | undefined,
    adminId: string,
    adminRole: string,
    ip?: string,
  ) {
    const before = await this.prisma.providerService.findUnique({
      where: {
        providerId_serviceType: {
          providerId,
          serviceType,
        },
      },
    });

    if (!before) {
      throw new NotFoundException({
        code: 'SERVICE_REGISTRATION_NOT_FOUND',
        message: `Provider has not registered for service ${serviceType}`,
      });
    }

    const after = await this.prisma.providerService.update({
      where: {
        providerId_serviceType: {
          providerId,
          serviceType,
        },
      },
      data: {
        status,
        approvedBy: adminId,
        approvedAt: status === ApprovalStatus.APPROVED ? new Date() : null,
        rejectionReason: status === ApprovalStatus.REJECTED ? reason || 'Service qualifications not met' : null,
      },
    });

    await this.auditService.log({
      actorId: adminId,
      actorRole: adminRole,
      action: `PROVIDER_SERVICE_${status}`,
      entityType: 'PROVIDER_SERVICE',
      entityId: after.id,
      before: { status: before.status, rejectionReason: before.rejectionReason },
      after: { status: after.status, rejectionReason: after.rejectionReason },
      ip,
    });

    return after;
  }

  async setDocumentStatus(
    documentId: string,
    status: ApprovalStatus,
    note: string | undefined,
    adminId: string,
    adminRole: string,
    ip?: string,
  ) {
    const before = await this.prisma.providerDocument.findUnique({
      where: { id: documentId },
    });

    if (!before) {
      throw new NotFoundException({
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found',
      });
    }

    const after = await this.prisma.providerDocument.update({
      where: { id: documentId },
      data: {
        status,
        reviewedBy: adminId,
        note: note || before.note,
      },
    });

    await this.auditService.log({
      actorId: adminId,
      actorRole: adminRole,
      action: `DOCUMENT_${status}`,
      entityType: 'PROVIDER_DOCUMENT',
      entityId: documentId,
      before: { status: before.status, note: before.note },
      after: { status: after.status, note: after.note },
      ip,
    });

    return after;
  }

  async getCustomers(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'CUSTOMER' },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          phone: true,
          email: true,
          fullName: true,
          status: true,
          createdAt: true,
          _count: {
            select: { serviceRequests: true, customerVehicles: true },
          },
        },
      }),
      this.prisma.user.count({ where: { role: 'CUSTOMER' } }),
    ]);

    return { items, total, page, limit };
  }

  async getCustomerDetail(customerId: string) {
    const customer = await this.prisma.user.findUnique({
      where: { id: customerId },
      include: {
        customerVehicles: true,
        serviceRequests: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async markRequestPaid(id: string, reason: string, adminId: string, adminRole: string, ip?: string) {
    const result = await this.paymentsService.markPaidManually(id, adminId, reason);
    await this.auditService.log({ actorId: adminId, actorRole: adminRole, action: 'REQUEST_MARKED_PAID', entityType: 'SERVICE_REQUEST', entityId: id, after: { paymentId: result.id, reason }, ip });
    return result;
  }

  async refundRequest(id: string, reason: string, refundReference: string | undefined, adminId: string, adminRole: string, ip?: string) {
    const result = await this.paymentsService.refund(id, adminId, reason, refundReference);
    await this.auditService.log({ actorId: adminId, actorRole: adminRole, action: 'REQUEST_REFUNDED', entityType: 'SERVICE_REQUEST', entityId: id, after: { reason, refundReference }, ip });
    return result;
  }

  getPayments() { return this.prisma.payment.findMany({ include: { request: { select: { code: true, serviceType: true, status: true, paymentStatus: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }); }
  getPayouts() { return this.prisma.payoutRequest.findMany({ include: { provider: { include: { user: { select: { fullName: true, phone: true } } } } }, orderBy: { requestedAt: 'desc' }, take: 200 }); }

  async decidePayout(id: string, approve: boolean, note: string | undefined, adminId: string, adminRole: string, ip?: string) {
    const before = await this.prisma.payoutRequest.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: 'PAYOUT_NOT_FOUND', message: 'Payout request not found' });
    if (before.status !== PayoutStatus.REQUESTED) throw new BadRequestException({ code: 'PAYOUT_ALREADY_REVIEWED', message: 'Payout request has already been reviewed' });
    const status = approve ? PayoutStatus.APPROVED : PayoutStatus.REJECTED;
    const after = await this.prisma.payoutRequest.update({ where: { id }, data: { status, note: note?.trim() || null, reviewedBy: adminId, reviewedAt: new Date() } });
    await this.auditService.log({ actorId: adminId, actorRole: adminRole, action: `PAYOUT_${status}`, entityType: 'PAYOUT_REQUEST', entityId: id, before, after, ip });
    return after;
  }

  async markPayoutPaid(id: string, reference: string, adminId: string, adminRole: string, ip?: string) {
    const result = await this.walletService.markPaid(id, adminId, reference);
    await this.auditService.log({ actorId: adminId, actorRole: adminRole, action: 'PAYOUT_PAID', entityType: 'PAYOUT_REQUEST', entityId: id, after: { reference }, ip });
    return result;
  }

  async dashboard() {
    const lagosNow = new Date(Date.now() + 60 * 60_000);
    const start = new Date(Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), lagosNow.getUTCDate()) - 60 * 60_000);
    const activeStatuses = [RequestStatus.ASSIGNED, RequestStatus.EN_ROUTE, RequestStatus.ARRIVED, RequestStatus.IN_PROGRESS];
    const [requestsToday, activeJobs, completedToday, onlineProviders, escalatedCount, revenue, accepted] = await Promise.all([
      this.prisma.serviceRequest.count({ where: { createdAt: { gte: start } } }),
      this.prisma.serviceRequest.count({ where: { status: { in: activeStatuses } } }),
      this.prisma.serviceRequest.count({ where: { status: RequestStatus.COMPLETED, completedAt: { gte: start } } }),
      this.prisma.providerProfile.count({ where: { availability: { in: ['ONLINE', 'RESERVED'] } } }),
      this.prisma.serviceRequest.count({ where: { status: RequestStatus.ESCALATED } }),
      this.prisma.payment.aggregate({ where: { status: PaymentStatus.PAID, paidAt: { gte: start } }, _sum: { amountKobo: true } }),
      this.prisma.serviceRequest.findMany({ where: { acceptedAt: { not: null }, searchStartedAt: { gte: start } }, select: { acceptedAt: true, searchStartedAt: true } }),
    ]);
    const avgTimeToAcceptSeconds = accepted.length ? Math.round(accepted.reduce((sum, row) => sum + ((row.acceptedAt!.getTime() - row.searchStartedAt.getTime()) / 1000), 0) / accepted.length) : 0;
    return { requestsToday, activeJobs, completedToday, completionRateBps: requestsToday ? Math.floor(completedToday * 10_000 / requestsToday) : 0, onlineProviders, escalatedCount, revenueTodayKobo: revenue._sum.amountKobo || 0n, avgTimeToAcceptSeconds };
  }

  async liveSnapshot() {
    const providers = await this.prisma.$queryRaw<Array<{ providerId: string; fullName: string | null; availability: string; lat: number; lng: number; receivedAt: Date }>>`
      SELECT pp.user_id AS "providerId", u.full_name AS "fullName", pp.availability::text,
             ST_Y(pl.location::geometry) AS lat, ST_X(pl.location::geometry) AS lng, pl.received_at AS "receivedAt"
      FROM provider_profiles pp JOIN users u ON u.id=pp.user_id JOIN provider_locations pl ON pl.provider_id=pp.user_id
      WHERE pp.availability IN ('ONLINE','RESERVED','BUSY')`;
    const activeRequests = await this.prisma.$queryRaw<Array<{ id: string; code: string; serviceType: string; status: string; providerId: string | null; pickupAddress: string; etaSeconds: number | null; lat: number; lng: number }>>`
      SELECT id, code, service_type::text AS "serviceType", status::text, provider_id AS "providerId", pickup_address AS "pickupAddress", eta_seconds AS "etaSeconds",
             ST_Y(pickup_location::geometry) AS lat, ST_X(pickup_location::geometry) AS lng
      FROM service_requests WHERE status IN ('ASSIGNED','EN_ROUTE','ARRIVED','IN_PROGRESS')`;
    return { providers, activeRequests, serverNow: new Date() };
  }

  async report(kind: 'requests' | 'revenue' | 'providers' | 'payouts', from?: Date, to?: Date) {
    const createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    if (kind === 'requests') return this.prisma.serviceRequest.findMany({ where: { createdAt }, orderBy: { createdAt: 'desc' }, select: { code: true, serviceType: true, status: true, priceKobo: true, paymentStatus: true, createdAt: true, completedAt: true } });
    if (kind === 'revenue') return this.prisma.payment.findMany({ where: { createdAt, status: { in: [PaymentStatus.PAID, PaymentStatus.REFUNDED] } }, orderBy: { createdAt: 'desc' }, select: { reference: true, amountKobo: true, status: true, gateway: true, paidAt: true } });
    if (kind === 'payouts') return this.prisma.payoutRequest.findMany({ where: { createdAt }, orderBy: { createdAt: 'desc' }, select: { id: true, providerId: true, amountKobo: true, status: true, requestedAt: true, paidReference: true } });
    return this.prisma.providerProfile.findMany({ where: { createdAt }, orderBy: { createdAt: 'desc' }, select: { userId: true, onboardingStatus: true, availability: true, completedJobs: true, ratingAvg: true, ratingCount: true, createdAt: true } });
  }
}
