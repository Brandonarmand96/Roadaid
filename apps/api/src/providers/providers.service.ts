import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.interface';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  ServiceType,
  ApprovalStatus,
  OnboardingStatus,
  ProviderAvailability,
  DocumentType,
  Role,
  LocationUpdateDto,
  locationUpdateSchema,
} from '@roadaid/shared';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class ProvidersService {
  private readonly lastEtaRefresh = new Map<string, number>();
  constructor(
    private readonly prisma: PrismaService,
    @Inject('STORAGE_SERVICE') private readonly storage: StorageService,
    private readonly realtimeGateway: RealtimeGateway,
    @Optional() private readonly wallet?: WalletService,
  ) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
      include: {
        services: true,
        documents: true,
        bankAccounts: true,
      },
    });

    if (!profile) {
      // Return empty draft representation if not yet initialized
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
      return {
        userId,
        onboardingStatus: OnboardingStatus.DRAFT,
        availability: ProviderAvailability.OFFLINE,
        services: [],
        documents: [],
      };
    }

    return profile;
  }

  async updateProfile(
    userId: string,
    data: {
      businessName?: string;
      address?: string;
      vehicleMake?: string;
      vehicleModel?: string;
      vehiclePlate?: string;
      equipmentNotes?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    if (user.role === Role.ADMIN) {
      throw new ForbiddenException({ code: 'PROVIDER_ENROLLMENT_FORBIDDEN', message: 'Administrators cannot register as providers' });
    }
    if (user.role === Role.CUSTOMER && user.lastLoginAt) {
      throw new ForbiddenException({
        code: 'CUSTOMER_PROVIDER_CONVERSION_BLOCKED',
        message: 'Customer accounts cannot be converted into provider accounts',
      });
    }
    if (user.role === Role.CUSTOMER) {
      await this.prisma.user.update({ where: { id: userId }, data: { role: Role.PROVIDER } });
    }

    return this.prisma.providerProfile.upsert({
      where: { userId },
      update: {
        businessName: data.businessName,
        address: data.address,
        vehicleMake: data.vehicleMake,
        vehicleModel: data.vehicleModel,
        vehiclePlate: data.vehiclePlate,
        equipmentNotes: data.equipmentNotes,
      },
      create: {
        userId,
        businessName: data.businessName,
        address: data.address,
        vehicleMake: data.vehicleMake,
        vehicleModel: data.vehicleModel,
        vehiclePlate: data.vehiclePlate,
        equipmentNotes: data.equipmentNotes,
        onboardingStatus: OnboardingStatus.DRAFT,
        availability: ProviderAvailability.OFFLINE,
      },
    });
  }

  async applyService(providerId: string, serviceType: ServiceType, details?: any) {
    // Ensure profile exists
    await this.ensureProfileExists(providerId);

    const existing = await this.prisma.providerService.findFirst({ where: { providerId } });
    if (existing && existing.serviceType !== serviceType) {
      throw new ConflictException({
        code: 'PROVIDER_SERVICE_LOCKED',
        message: `This provider is registered for ${existing.serviceType}. Each provider account can operate one service only.`,
      });
    }

    return this.prisma.providerService.upsert({
      where: {
        providerId_serviceType: {
          providerId,
          serviceType,
        },
      },
      update: {
        status: ApprovalStatus.PENDING,
        details: details || {},
        rejectionReason: null,
      },
      create: {
        providerId,
        serviceType,
        status: ApprovalStatus.PENDING,
        details: details || {},
      },
    });
  }

  async getServices(providerId: string) {
    return this.prisma.providerService.findMany({
      where: { providerId },
    });
  }

  async uploadDocument(
    providerId: string,
    file: Express.Multer.File,
    docType: DocumentType,
    serviceType?: ServiceType,
  ) {
    await this.ensureProfileExists(providerId);

    if (!file) {
      throw new BadRequestException({
        code: 'MISSING_FILE',
        message: 'No file provided for document upload',
      });
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: 'Only JPEG, PNG, WEBP, and PDF documents are allowed',
      });
    }

    const maxSizeBytes = 8 * 1024 * 1024; // 8MB
    if (file.size > maxSizeBytes) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: 'File size must not exceed 8MB',
      });
    }

    if (!this.hasValidFileSignature(file)) {
      throw new BadRequestException({
        code: 'INVALID_FILE_CONTENT',
        message: 'The file contents do not match the declared document type',
      });
    }

    const { storageKey, sizeBytes, mimeType } = await this.storage.upload(
      file,
      `providers/${providerId}`,
    );

    return this.prisma.providerDocument.create({
      data: {
        providerId,
        docType,
        serviceType: serviceType || null,
        storageKey,
        mimeType,
        sizeBytes,
        status: ApprovalStatus.PENDING,
      },
    });
  }

  async getDocuments(providerId: string) {
    return this.prisma.providerDocument.findMany({
      where: { providerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteDocument(providerId: string, documentId: string) {
    const doc = await this.prisma.providerDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException({
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found',
      });
    }

    if (doc.providerId !== providerId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'You do not own this document',
      });
    }

    if (doc.status === ApprovalStatus.APPROVED) {
      throw new BadRequestException({
        code: 'CANNOT_DELETE_APPROVED_DOCUMENT',
        message: 'Cannot delete a verified and approved document',
      });
    }

    await this.storage.delete(doc.storageKey);
    await this.prisma.providerDocument.delete({
      where: { id: documentId },
    });

    return { success: true };
  }

  async submitApplication(providerId: string) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId: providerId },
      include: {
        services: true,
        documents: true,
      },
    });

    if (!profile) {
      throw new BadRequestException({
        code: 'PROFILE_INCOMPLETE',
        message: 'Please complete your provider profile before submitting',
      });
    }

    if (!profile.vehicleMake || !profile.vehiclePlate) {
      throw new BadRequestException({
        code: 'VEHICLE_DETAILS_REQUIRED',
        message: 'Service vehicle make and license plate number are required',
      });
    }

    if (profile.services.length !== 1) {
      throw new BadRequestException({
        code: 'ONE_SERVICE_REQUIRED',
        message: 'Choose exactly one service category for this provider account',
      });
    }

    const hasId = profile.documents.some(
      (d) => d.docType === DocumentType.NATIONAL_ID || d.docType === DocumentType.DRIVERS_LICENCE,
    );
    if (!hasId) {
      throw new BadRequestException({
        code: 'ID_DOCUMENT_REQUIRED',
        message: 'Valid identity document (National ID or Driver License) is required',
      });
    }

    return this.prisma.providerProfile.update({
      where: { userId: providerId },
      data: {
        onboardingStatus: OnboardingStatus.SUBMITTED,
        rejectionReason: null,
      },
    });
  }

  async setAvailability(providerId: string, state: ProviderAvailability) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId: providerId },
      include: {
        services: true,
        location: true,
      },
    });

    if (!profile) {
      throw new NotFoundException({
        code: 'PROVIDER_PROFILE_NOT_FOUND',
        message: 'Provider profile not found',
      });
    }

    // ONLINE Invariants enforcement
    if (state === ProviderAvailability.ONLINE) {
      const commission = await this.wallet?.commissionPolicy(providerId);
      if (commission?.blocked) throw new BadRequestException({ code: 'CASH_COMMISSION_LIMIT_REACHED', message: 'Repay your outstanding cash commission before going online again.' });
      if (profile.onboardingStatus !== OnboardingStatus.APPROVED) {
        throw new BadRequestException({
          code: 'PROVIDER_NOT_APPROVED',
          message: 'Your provider application is not approved yet. You cannot go online.',
        });
      }

      const hasApprovedService = profile.services.some(
        (s) => s.status === ApprovalStatus.APPROVED,
      );
      if (!hasApprovedService) {
        throw new BadRequestException({
          code: 'NO_APPROVED_SERVICES',
          message: 'You do not have any approved services. You cannot go online.',
        });
      }

      if (profile.currentRequestId) {
        throw new ConflictException({
          code: 'PROVIDER_HAS_ACTIVE_JOB',
          message: 'Cannot toggle availability while an active job is in progress',
        });
      }

      // Check fresh location (<90s)
      if (!profile.location) {
        throw new BadRequestException({
          code: 'NO_LOCATION_AVAILABLE',
          message: 'Fresh GPS location is required to go online. Please enable location services.',
        });
      }

      const locationAgeSeconds = (Date.now() - profile.location.receivedAt.getTime()) / 1000;
      if (locationAgeSeconds > 90) {
        throw new BadRequestException({
          code: 'STALE_LOCATION',
          message: `Last location was received ${Math.round(locationAgeSeconds)}s ago. Fresh location (<90s) is required to go online.`,
        });
      }
    }

    const updated = await this.prisma.providerProfile.update({
      where: { userId: providerId },
      data: { availability: state },
    });

    // Realtime notification to admin
    this.realtimeGateway.emitProviderAvailability(providerId, state);

    return updated;
  }

  async updateLocation(providerId: string, dto: LocationUpdateDto, emitRealtime = true) {
    const profile = await this.prisma.providerProfile.findUnique({ where: { userId: providerId } });
    if (!profile) throw new NotFoundException({ code: 'PROVIDER_PROFILE_NOT_FOUND', message: 'Provider profile not found' });
    const recordedAt = new Date(dto.recordedAt);
    const now = Date.now();
    if (recordedAt.getTime() > now + 60_000 || recordedAt.getTime() < now - 5 * 60_000) {
      throw new BadRequestException({ code: 'INVALID_LOCATION_TIME', message: 'Location timestamp is outside the accepted range' });
    }
    const latestAccepted = await this.prisma.$transaction(async (tx) => {
      const accepted = await tx.$queryRaw<Array<{ recorded_at: Date }>>`
        INSERT INTO provider_locations
          (provider_id, location, heading, speed_mps, accuracy_m, recorded_at, received_at, created_at, updated_at)
        VALUES
          (${providerId}::uuid, ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography,
           ${dto.heading ?? null}, ${dto.speed ?? null}, ${dto.accuracy}, ${recordedAt}, now(), now(), now())
        ON CONFLICT (provider_id) DO UPDATE SET
          location=EXCLUDED.location, heading=EXCLUDED.heading, speed_mps=EXCLUDED.speed_mps,
          accuracy_m=EXCLUDED.accuracy_m, recorded_at=EXCLUDED.recorded_at, received_at=now(), updated_at=now()
        WHERE provider_locations.recorded_at <= EXCLUDED.recorded_at
        RETURNING recorded_at`;
      if (profile.currentRequestId) {
        await tx.$executeRaw`
          INSERT INTO provider_location_history
            (id, provider_id, request_id, location, accuracy_m, recorded_at, created_at)
          VALUES
            (gen_random_uuid(), ${providerId}::uuid, ${profile.currentRequestId}::uuid,
             ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography,
             ${dto.accuracy}, ${recordedAt}, now())
          ON CONFLICT (provider_id, recorded_at) DO NOTHING`;
      }
      return accepted.length === 1;
    });
    const receivedAt = new Date().toISOString();
    if (latestAccepted && profile.currentRequestId && emitRealtime) await this.publishLocation(providerId, profile.currentRequestId, dto, receivedAt);
    return { success: true, accepted: latestAccepted, receivedAt, warning: dto.accuracy > 200 ? 'LOW_ACCURACY' : undefined };
  }

  async updateLocationBatch(providerId: string, points: LocationUpdateDto[]) {
    if (!Array.isArray(points) || points.length === 0 || points.length > 200) throw new BadRequestException({ code: 'INVALID_LOCATION_BATCH', message: 'Location batch must contain between 1 and 200 points' });
    const deduplicated = new Map<string, LocationUpdateDto>();
    for (const point of points) {
      const parsed = locationUpdateSchema.safeParse(point);
      if (!parsed.success) throw new BadRequestException({ code: 'INVALID_LOCATION_POINT', message: 'Location batch contains an invalid point' });
      const recordedAt = new Date(parsed.data.recordedAt);
      const now = Date.now();
      if (recordedAt.getTime() > now + 60_000 || recordedAt.getTime() < now - 5 * 60_000) throw new BadRequestException({ code: 'INVALID_LOCATION_TIME', message: 'Location timestamp is outside the accepted range' });
      deduplicated.set(parsed.data.recordedAt, parsed.data);
    }
    const ordered = [...deduplicated.values()].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
    const profile = await this.prisma.providerProfile.findUnique({ where: { userId: providerId } });
    if (!profile) throw new NotFoundException({ code: 'PROVIDER_PROFILE_NOT_FOUND', message: 'Provider profile not found' });
    const newest = ordered[ordered.length - 1];
    const payload = JSON.stringify(ordered.map((point) => ({ ...point, recorded_at: point.recordedAt })));
    const latestAccepted = await this.prisma.$transaction(async (tx) => {
      if (profile.currentRequestId) {
        await tx.$executeRaw`
          INSERT INTO provider_location_history (id, provider_id, request_id, location, accuracy_m, recorded_at, created_at)
          SELECT gen_random_uuid(), ${providerId}::uuid, ${profile.currentRequestId}::uuid,
            ST_SetSRID(ST_MakePoint(point.lng, point.lat), 4326)::geography,
            point.accuracy, point.recorded_at, now()
          FROM jsonb_to_recordset(${payload}::jsonb)
            AS point(lat double precision, lng double precision, accuracy double precision, recorded_at timestamptz)
          ON CONFLICT (provider_id, recorded_at) DO NOTHING`;
      }
      const accepted = await tx.$queryRaw<Array<{ recorded_at: Date }>>`
        INSERT INTO provider_locations
          (provider_id, location, heading, speed_mps, accuracy_m, recorded_at, received_at, created_at, updated_at)
        VALUES
          (${providerId}::uuid, ST_SetSRID(ST_MakePoint(${newest.lng}, ${newest.lat}), 4326)::geography,
           ${newest.heading ?? null}, ${newest.speed ?? null}, ${newest.accuracy}, ${new Date(newest.recordedAt)}, now(), now(), now())
        ON CONFLICT (provider_id) DO UPDATE SET
          location=EXCLUDED.location, heading=EXCLUDED.heading, speed_mps=EXCLUDED.speed_mps,
          accuracy_m=EXCLUDED.accuracy_m, recorded_at=EXCLUDED.recorded_at, received_at=now(), updated_at=now()
        WHERE provider_locations.recorded_at <= EXCLUDED.recorded_at
        RETURNING recorded_at`;
      return accepted.length === 1;
    });
    if (latestAccepted && profile.currentRequestId) {
      await this.publishLocation(providerId, profile.currentRequestId, newest, new Date().toISOString());
    }
    return { success: true, accepted: ordered.length, latestAccepted };
  }

  private async publishLocation(providerId: string, requestId: string, point: LocationUpdateDto, receivedAt: string) {
    this.realtimeGateway.emitProviderLocation(requestId, { requestId, providerId, ...point, receivedAt });
    const now = Date.now();
    if (now - (this.lastEtaRefresh.get(requestId) || 0) < 30_000) return;
    const [distance] = await this.prisma.$queryRaw<Array<{ distance_m: number }>>`
      SELECT ST_Distance(pickup_location, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography)::float AS distance_m
      FROM service_requests WHERE id=${requestId}::uuid AND status='EN_ROUTE'`;
    if (!distance) return;
    const etaSeconds = Math.max(60, Math.round(distance.distance_m / 8.3));
    await this.prisma.serviceRequest.update({ where: { id: requestId }, data: { etaSeconds } });
    this.realtimeGateway.emitRequestEta(requestId, etaSeconds);
    this.lastEtaRefresh.set(requestId, now);
  }

  private async ensureProfileExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== Role.PROVIDER) {
      throw new ForbiddenException({
        code: 'PROVIDER_ROLE_REQUIRED',
        message: 'A provider account is required for this operation',
      });
    }

    return this.prisma.providerProfile.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        onboardingStatus: OnboardingStatus.DRAFT,
        availability: ProviderAvailability.OFFLINE,
      },
    });
  }

  private hasValidFileSignature(file: Express.Multer.File): boolean {
    const buffer = file.buffer;
    if (!buffer || buffer.length < 4) return false;

    if (file.mimetype === 'image/jpeg') {
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (file.mimetype === 'image/png') {
      return buffer.length >= 8 && buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    }
    if (file.mimetype === 'image/webp') {
      return buffer.length >= 12
        && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
        && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    if (file.mimetype === 'application/pdf') {
      return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    }
    return false;
  }
}
