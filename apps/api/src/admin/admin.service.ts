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
import { PricingRuleDto } from '@roadaid/shared';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject('STORAGE_SERVICE') private readonly storage: StorageService,
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

  getRequests(status?: string, serviceType?: ServiceType) {
    return this.prisma.serviceRequest.findMany({
      where: { ...(status ? { status: status as any } : {}), ...(serviceType ? { serviceType } : {}) },
      include: { customer: { select: { id: true, phone: true, fullName: true } }, provider: { select: { id: true, phone: true, fullName: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
  }

  async getRequestDetail(id: string) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id }, include: { customer: { select: { id: true, phone: true, fullName: true } }, provider: { select: { id: true, phone: true, fullName: true } }, events: { orderBy: { createdAt: 'asc' } } } });
    if (!request) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found' });
    return request;
  }

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
}
