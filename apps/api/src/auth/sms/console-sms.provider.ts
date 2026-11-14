import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider } from './sms.interface';

@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger(ConsoleSmsProvider.name);

  async sendOtp(phone: string, code: string): Promise<boolean> {
    const maskedPhone = phone.length > 7
      ? `${phone.slice(0, 6)}****${phone.slice(-4)}`
      : '***';
    this.logger.log(`[DEV SMS] Sent OTP to ${maskedPhone}: ${code}`);
    return true;
  }
}
