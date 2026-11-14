import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ProvidersService } from '../src/providers/providers.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import {
  OnboardingStatus,
  ApprovalStatus,
  ProviderAvailability,
  ServiceType,
  DocumentType,
} from '@roadaid/shared';

describe('ProvidersService & Availability Invariants (Phase 1)', () => {
  let service: ProvidersService;
  let prisma: any;
  let storage: any;
  let realtimeGateway: any;

  beforeEach(async () => {
    prisma = {
      user: {
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      providerProfile: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      providerService: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      providerDocument: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };

    storage = {
      upload: jest.fn().mockResolvedValue({
        storageKey: 'providers/p1/doc-1.jpg',
        sizeBytes: 1024,
        mimeType: 'image/jpeg',
      }),
      delete: jest.fn().mockResolvedValue(true),
      getSignedUrl: jest.fn().mockResolvedValue('http://signed.url/doc'),
    };

    realtimeGateway = {
      emitProviderAvailability: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProvidersService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'STORAGE_SERVICE', useValue: storage },
        { provide: RealtimeGateway, useValue: realtimeGateway },
      ],
    }).compile();

    service = module.get<ProvidersService>(ProvidersService);
  });

  describe('Provider Availability Invariants (Gate Requirement)', () => {
    it('INVARIANT 1: Unapproved provider CANNOT go online', async () => {
      prisma.providerProfile.findUnique.mockResolvedValue({
        userId: 'prov-1',
        onboardingStatus: OnboardingStatus.SUBMITTED, // NOT APPROVED
        services: [{ serviceType: ServiceType.FUEL, status: ApprovalStatus.APPROVED }],
        location: { receivedAt: new Date() },
        currentRequestId: null,
      });

      await expect(
        service.setAvailability('prov-1', ProviderAvailability.ONLINE),
      ).rejects.toThrow(BadRequestException);
    });

    it('INVARIANT 2: Approved provider with NO approved services CANNOT go online', async () => {
      prisma.providerProfile.findUnique.mockResolvedValue({
        userId: 'prov-1',
        onboardingStatus: OnboardingStatus.APPROVED,
        services: [
          { serviceType: ServiceType.FUEL, status: ApprovalStatus.REJECTED },
          { serviceType: ServiceType.TOWING, status: ApprovalStatus.PENDING },
        ], // None approved
        location: { receivedAt: new Date() },
        currentRequestId: null,
      });

      await expect(
        service.setAvailability('prov-1', ProviderAvailability.ONLINE),
      ).rejects.toThrow(BadRequestException);
    });

    it('INVARIANT 3: Approved provider with STALE location (>90s) CANNOT go online', async () => {
      const staleTime = new Date(Date.now() - 120 * 1000); // 120s old
      prisma.providerProfile.findUnique.mockResolvedValue({
        userId: 'prov-1',
        onboardingStatus: OnboardingStatus.APPROVED,
        services: [{ serviceType: ServiceType.FUEL, status: ApprovalStatus.APPROVED }],
        location: { receivedAt: staleTime },
        currentRequestId: null,
      });

      await expect(
        service.setAvailability('prov-1', ProviderAvailability.ONLINE),
      ).rejects.toThrow(BadRequestException);
    });

    it('INVARIANT 4: Provider with active job CANNOT change availability', async () => {
      prisma.providerProfile.findUnique.mockResolvedValue({
        userId: 'prov-1',
        onboardingStatus: OnboardingStatus.APPROVED,
        services: [{ serviceType: ServiceType.FUEL, status: ApprovalStatus.APPROVED }],
        location: { receivedAt: new Date() },
        currentRequestId: 'req-active-123', // Busy with job
      });

      await expect(
        service.setAvailability('prov-1', ProviderAvailability.ONLINE),
      ).rejects.toThrow(ConflictException);
    });

    it('SUCCESS: Fully approved provider with approved service and fresh GPS goes ONLINE', async () => {
      prisma.providerProfile.findUnique.mockResolvedValue({
        userId: 'prov-1',
        onboardingStatus: OnboardingStatus.APPROVED,
        services: [{ serviceType: ServiceType.FUEL, status: ApprovalStatus.APPROVED }],
        location: { receivedAt: new Date() },
        currentRequestId: null,
      });

      prisma.providerProfile.update.mockResolvedValue({
        userId: 'prov-1',
        availability: ProviderAvailability.ONLINE,
      });

      const res = await service.setAvailability('prov-1', ProviderAvailability.ONLINE);
      expect(res.availability).toBe(ProviderAvailability.ONLINE);
      expect(realtimeGateway.emitProviderAvailability).toHaveBeenCalledWith(
        'prov-1',
        ProviderAvailability.ONLINE,
      );
    });
  });

  describe('Document Upload & Constraints', () => {
    it('rejects upload exceeding 8MB', async () => {
      const largeFile: any = {
        mimetype: 'image/jpeg',
        size: 9 * 1024 * 1024, // 9MB
      };

      await expect(
        service.uploadDocument('prov-1', largeFile, DocumentType.NATIONAL_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unsupported mime type (e.g. video or executable)', async () => {
      const invalidFile: any = {
        mimetype: 'video/mp4',
        size: 1024,
      };

      await expect(
        service.uploadDocument('prov-1', invalidFile, DocumentType.NATIONAL_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a file whose bytes do not match its declared MIME type', async () => {
      const disguisedFile: any = {
        originalname: 'identity.jpg',
        mimetype: 'image/jpeg',
        size: 12,
        buffer: Buffer.from('not-a-jpeg'),
      };

      await expect(
        service.uploadDocument('prov-1', disguisedFile, DocumentType.NATIONAL_ID),
      ).rejects.toThrow(BadRequestException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('accepts a file with a valid signature', async () => {
      const jpegFile: any = {
        originalname: 'identity.jpg',
        mimetype: 'image/jpeg',
        size: 7,
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a]),
      };
      prisma.providerDocument.create.mockResolvedValue({ id: 'doc-1' });

      await expect(
        service.uploadDocument('prov-1', jpegFile, DocumentType.NATIONAL_ID),
      ).resolves.toEqual({ id: 'doc-1' });
      expect(storage.upload).toHaveBeenCalledWith(jpegFile, 'providers/prov-1');
    });

    it('prevents deletion of an already approved document', async () => {
      prisma.providerDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        providerId: 'prov-1',
        status: ApprovalStatus.APPROVED, // Already approved
      });

      await expect(service.deleteDocument('prov-1', 'doc-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
