import { BadGatewayException, Injectable } from '@nestjs/common';
import { InitializePaymentInput, PaymentGatewayService, VerifiedPayment } from './payment-gateway.interface';

@Injectable()
export class PaystackGateway implements PaymentGatewayService {
  private get secret() {
    const value = process.env.PAYSTACK_SECRET_KEY;
    if (!value) throw new BadGatewayException({ code: 'PAYMENT_GATEWAY_NOT_CONFIGURED', message: 'Payment gateway is not configured' });
    return value;
  }

  async initialize(input: InitializePaymentInput) {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: input.amountKobo.toString(), email: input.email, reference: input.reference, metadata: { requestId: input.requestId } }),
    });
    const json = await response.json() as { status?: boolean; message?: string; data?: { authorization_url?: string } };
    if (!response.ok || !json.status || !json.data?.authorization_url) throw new BadGatewayException({ code: 'PAYMENT_INITIALIZATION_FAILED', message: json.message || 'Unable to initialize payment' });
    return { authorizationUrl: json.data.authorization_url };
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${this.secret}` } });
    const json = await response.json() as { status?: boolean; message?: string; data?: { status?: string; amount?: number; currency?: string; reference?: string } };
    if (!response.ok || !json.status || !json.data) throw new BadGatewayException({ code: 'PAYMENT_VERIFICATION_FAILED', message: json.message || 'Unable to verify payment' });
    return { reference: json.data.reference || reference, status: json.data.status === 'success' ? 'success' : 'failed', amountKobo: BigInt(json.data.amount || 0), currency: json.data.currency || '', response: json };
  }
}
