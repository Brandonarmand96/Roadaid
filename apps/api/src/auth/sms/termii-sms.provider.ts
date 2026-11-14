import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider } from './sms.interface';

@Injectable()
export class TermiiSmsProvider implements SmsProvider {
  private readonly logger = new Logger(TermiiSmsProvider.name);

  async sendOtp(phone: string, code: string): Promise<boolean> {
    const apiKey = process.env.TERMII_API_KEY;
    const senderId = process.env.TERMII_SENDER_ID || 'RoadAid';

    if (!apiKey) {
      this.logger.warn('TERMII_API_KEY is not set. Termii SMS skipped.');
      return false;
    }

    try {
      const maskedPhone = phone.length > 7
        ? `${phone.slice(0, 6)}****${phone.slice(-4)}`
        : '***';
      this.logger.log(`Sending Termii OTP to ${maskedPhone}...`);

      const response = await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone,
          from: senderId,
          sms: `Your RoadAid verification code is: ${code}. Valid for 5 minutes. Do not share this code.`,
          type: 'plain',
          channel: 'generic',
          api_key: apiKey,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.error(`Termii SMS failed with status ${response.status}: ${text}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to send SMS via Termii', error);
      return false;
    }
  }
}
