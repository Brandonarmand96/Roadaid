import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController, AdminAuthController, DevicesController } from './auth.controller';
import { SmsService } from './sms/sms.service';

@Module({
  controllers: [AuthController, AdminAuthController, DevicesController],
  providers: [AuthService, SmsService],
  exports: [AuthService],
})
export class AuthModule {}
