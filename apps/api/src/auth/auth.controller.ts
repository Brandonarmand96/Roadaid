import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  requestOtpSchema,
  verifyOtpSchema,
  adminLoginSchema,
  updateProfileSchema,
  deviceTokenSchema,
  RequestOtpDto,
  VerifyOtpDto,
  AdminLoginDto,
  UpdateProfileDto,
  DeviceTokenDto,
} from '@roadaid/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  async requestOtp(@Body(new ZodValidationPipe(requestOtpSchema)) dto: RequestOtpDto) {
    return this.authService.requestOtp(dto.phone);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body(new ZodValidationPipe(verifyOtpSchema)) dto: VerifyOtpDto,
    @Req() req: any,
  ) {
    const deviceInfo = req.headers['user-agent'];
    return this.authService.verifyOtp(dto.phone, dto.code, deviceInfo);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refreshToken') refreshToken: string, @Req() req: any) {
    const deviceInfo = req.headers['user-agent'];
    return this.authService.refreshToken(refreshToken, deviceInfo);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body('refreshToken') refreshToken: string) {
    return this.authService.logout(refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('profile')
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName,
        email: dto.email,
      },
      select: {
        id: true,
        phone: true,
        email: true,
        fullName: true,
        role: true,
        avatarUrl: true,
      },
    });
  }
}

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(
    @Body(new ZodValidationPipe(adminLoginSchema)) dto: AdminLoginDto,
    @Req() req: any,
  ) {
    const deviceInfo = req.headers['user-agent'];
    return this.authService.adminLogin(dto.email, dto.password, deviceInfo);
  }
}

@Controller('devices')
export class DevicesController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async registerDevice(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(deviceTokenSchema)) dto: DeviceTokenDto,
  ) {
    return this.authService.registerDevice(userId, dto);
  }
}
