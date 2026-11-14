import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from './sms/sms.service';
import { Role, UserStatus, DeviceTokenDto } from '@roadaid/shared';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
  ) {}

  // Request OTP
  async requestOtp(phone: string): Promise<{ success: boolean; message: string }> {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    // Rate-limit: 3 requests per 10 min per phone
    const recentCount = await this.prisma.otpCode.count({
      where: {
        phone,
        createdAt: { gte: tenMinutesAgo },
      },
    });

    if (recentCount >= 3) {
      throw new BadRequestException({
        code: 'OTP_RATE_LIMIT_EXCEEDED',
        message: 'Too many OTP requests. Please wait 10 minutes before requesting again.',
      });
    }

    // Determine code
    const isDev = process.env.NODE_ENV !== 'production';
    const devFixedCode = process.env.OTP_DEV_FIXED_CODE || '123456';
    const otp = isDev ? devFixedCode : crypto.randomInt(100000, 1000000).toString();

    const codeHash = await argon2.hash(otp);
    const ttlSeconds = parseInt(process.env.OTP_TTL_SECONDS || '300', 10);
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    await this.prisma.otpCode.create({
      data: {
        phone,
        codeHash,
        purpose: 'LOGIN',
        expiresAt,
        attempts: 0,
      },
    });

    await this.smsService.sendOtp(phone, otp);

    return {
      success: true,
      message: 'OTP sent successfully',
    };
  }

  // Verify OTP
  async verifyOtp(phone: string, code: string, deviceInfo?: string) {
    const now = new Date();

    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        phone,
        purpose: 'LOGIN',
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException({
        code: 'NO_PENDING_OTP',
        message: 'No pending OTP found for this phone number. Please request a new code.',
      });
    }

    if (otpRecord.attempts >= 5) {
      throw new BadRequestException({
        code: 'OTP_MAX_ATTEMPTS_EXCEEDED',
        message: 'Maximum OTP verification attempts exceeded. Please request a new code.',
      });
    }

    if (now > otpRecord.expiresAt) {
      throw new BadRequestException({
        code: 'OTP_EXPIRED',
        message: 'OTP code has expired. Please request a new code.',
      });
    }

    const isValid = await argon2.verify(otpRecord.codeHash, code);
    if (!isValid) {
      await this.prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException({
        code: 'INVALID_OTP_CODE',
        message: 'Incorrect verification code. Please try again.',
      });
    }

    // Atomically consume the code so concurrent verification attempts cannot both succeed.
    const consumed = await this.prisma.otpCode.updateMany({
      where: { id: otpRecord.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException({
        code: 'OTP_ALREADY_CONSUMED',
        message: 'This verification code has already been used. Please request a new code.',
      });
    }

    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { phone },
    });

    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      user = await this.prisma.user.create({
        data: {
          phone,
          role: Role.CUSTOMER,
          status: UserStatus.ACTIVE,
        },
      });
    } else {
      if (user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException({
          code: 'ACCOUNT_SUSPENDED',
          message: 'This account is suspended or inactive.',
        });
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now },
      });
    }

    const tokens = await this.generateTokens(user.id, user.role, user.adminRole, deviceInfo);

    return {
      ...tokens,
      isNewUser,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        adminRole: user.adminRole,
        avatarUrl: user.avatarUrl,
        status: user.status,
      },
    };
  }

  // Admin login
  async adminLogin(email: string, password: string, deviceInfo?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || user.role !== Role.ADMIN || !user.passwordHash) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid administrative email or password',
      });
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Administrator account is suspended or inactive',
      });
    }

    const validPassword = await argon2.verify(user.passwordHash, password);
    if (!validPassword) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid administrative email or password',
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(user.id, user.role, user.adminRole, deviceInfo);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        adminRole: user.adminRole,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  // Token refresh with reuse detection
  async refreshToken(rawRefreshToken: string, deviceInfo?: string) {
    const now = new Date();
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const tokenRecord = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { user: true },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token',
      });
    }

    // Reuse detection: if already revoked, revoke all tokens for this user!
    if (tokenRecord.revokedAt !== null) {
      this.logger.warn(`Potential refresh token reuse attack detected for user ${tokenRecord.userId}! Revoking all tokens.`);
      await this.prisma.refreshToken.updateMany({
        where: { userId: tokenRecord.userId },
        data: { revokedAt: now },
      });
      throw new UnauthorizedException({
        code: 'TOKEN_REUSE_DETECTED',
        message: 'Token reuse detected. All sessions revoked for security.',
      });
    }

    if (now > tokenRecord.expiresAt) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_EXPIRED',
        message: 'Refresh token has expired. Please log in again.',
      });
    }

    if (tokenRecord.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'This account is suspended or inactive.',
      });
    }

    // Revoke current token
    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revokedAt: now },
    });

    // Generate new pair
    return this.generateTokens(
      tokenRecord.user.id,
      tokenRecord.user.role,
      tokenRecord.user.adminRole,
      deviceInfo,
    );
  }

  // Logout
  async logout(rawRefreshToken: string) {
    if (!rawRefreshToken) return { success: true };
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  // Register device push token
  async registerDevice(userId: string, dto: DeviceTokenDto) {
    return this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      update: {
        userId,
        platform: dto.platform,
        app: dto.app,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        platform: dto.platform,
        token: dto.token,
        app: dto.app,
      },
    });
  }

  // Helper: Token generation
  private async generateTokens(
    userId: string,
    role: string,
    adminRole?: string | null,
    deviceInfo?: string,
  ) {
    const accessSecret = process.env.JWT_ACCESS_SECRET || 'development_jwt_access_secret_key_minimum_32_characters_long_for_security';
    const accessTtl = (process.env.JWT_ACCESS_TTL || '15m') as SignOptions['expiresIn'];

    const accessToken = jwt.sign(
      {
        userId,
        role,
        adminRole,
      },
      accessSecret,
      { expiresIn: accessTtl },
    );

    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const refreshTtlDays = 30;
    const expiresAt = new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        deviceInfo: deviceInfo || 'unknown',
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }
}
