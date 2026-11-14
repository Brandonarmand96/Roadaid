import { Injectable } from '@nestjs/common';
import { SmsProvider } from './sms.interface';
import { ConsoleSmsProvider } from './console-sms.provider';
import { TermiiSmsProvider } from './termii-sms.provider';

@Injectable()
export class SmsService {
  private readonly provider: SmsProvider;

  constructor() {
    const providerType = process.env.SMS_PROVIDER || 'console';
    if (providerType === 'termii') {
      this.provider = new TermiiSmsProvider();
    } else {
      this.provider = new ConsoleSmsProvider();
    }
  }

  async sendOtp(phone: string, code: string): Promise<boolean> {
    return this.provider.sendOtp(phone, code);
  }
}
