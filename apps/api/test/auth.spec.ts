import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SmsService } from '../src/auth/sms/sms.service';
import { Role, UserStatus } from '@roadaid/shared';

describe('AuthService (Phase 1)', () => {
  let authService: AuthService;
  let prisma: any;
  let smsService: any;

  beforeEach(async () => {
    prisma = {
      otpCode: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      deviceToken: {
        upsert: jest.fn(),
      },
    };

    smsService = {
      sendOtp: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: SmsService, useValue: smsService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe('OTP Request & Rate Limiting', () => {
    it('allows OTP request when within rate limit (< 3 per 10m)', async () => {
      prisma.otpCode.count.mockResolvedValue(1);
      prisma.otpCode.create.mockResolvedValue({ id: 'otp-1' });

      const result = await authService.requestOtp('+2348012345678');
      expect(result.success).toBe(true);
      expect(smsService.sendOtp).toHaveBeenCalledWith('+2348012345678', '123456');
    });

    it('rejects OTP request when rate limit exceeded (>= 3 per 10m)', async () => {
      prisma.otpCode.count.mockResolvedValue(3);

      await expect(authService.requestOtp('+2348012345678')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('OTP Verification & Attempt Limits', () => {
    it('verifies valid OTP, creates new customer user, and issues tokens', async () => {
      const codeHash = await argon2.hash('123456');
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'otp-1',
        phone: '+2348012345678',
        codeHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 100000),
      });

      prisma.user.findUnique.mockResolvedValue(null); // New user
      prisma.user.create.mockResolvedValue({
        id: 'user-new-1',
        phone: '+2348012345678',
        role: Role.CUSTOMER,
        status: UserStatus.ACTIVE,
      });

      const result = await authService.verifyOtp('+2348012345678', '123456');
      expect(result.isNewUser).toBe(true);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.role).toBe(Role.CUSTOMER);
      expect(prisma.otpCode.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'otp-1', consumedAt: null },
          data: expect.objectContaining({ consumedAt: expect.any(Date) }),
        }),
      );
    });

    it('rejects expired OTP', async () => {
      const codeHash = await argon2.hash('123456');
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'otp-1',
        phone: '+2348012345678',
        codeHash,
        attempts: 0,
        expiresAt: new Date(Date.now() - 5000), // expired
      });

      await expect(authService.verifyOtp('+2348012345678', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('increments attempts on wrong code and rejects', async () => {
      const codeHash = await argon2.hash('123456');
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'otp-1',
        phone: '+2348012345678',
        codeHash,
        attempts: 1,
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(authService.verifyOtp('+2348012345678', '999999')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.otpCode.update).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: { attempts: { increment: 1 } },
      });
    });

    it('rejects if OTP attempts exceed limit (>= 5)', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'otp-1',
        phone: '+2348012345678',
        attempts: 5,
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(authService.verifyOtp('+2348012345678', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Refresh Token Rotation & Reuse Detection', () => {
    it('revokes all user tokens if an already revoked token is re-submitted (reuse attack)', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'token-old',
        userId: 'user-1',
        revokedAt: new Date(Date.now() - 10000), // already revoked
        expiresAt: new Date(Date.now() + 100000),
        user: { id: 'user-1', role: Role.CUSTOMER },
      });

      await expect(authService.refreshToken('replayed-token')).rejects.toThrow(
        UnauthorizedException,
      );

      // Verify all user tokens were revoked
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
    });
  });

  describe('Admin Login', () => {
    it('authenticates admin with valid argon2 password', async () => {
      const passwordHash = await argon2.hash('AdminSecret123!');
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'ops@roadaid.co',
        role: Role.ADMIN,
        adminRole: 'OPERATIONS',
        status: UserStatus.ACTIVE,
        passwordHash,
      });

      const result = await authService.adminLogin('ops@roadaid.co', 'AdminSecret123!');
      expect(result.accessToken).toBeDefined();
      expect(result.user.role).toBe(Role.ADMIN);
    });

    it('rejects non-admin or incorrect password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.adminLogin('unknown@roadaid.co', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
