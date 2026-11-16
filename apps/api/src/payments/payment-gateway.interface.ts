export interface InitializePaymentInput {
  reference: string;
  amountKobo: bigint;
  email: string;
  requestId: string;
}

export interface VerifiedPayment {
  reference: string;
  status: 'success' | 'failed';
  amountKobo: bigint;
  currency: string;
  response: unknown;
}

export interface PaymentGatewayService {
  initialize(input: InitializePaymentInput): Promise<{ authorizationUrl: string }>;
  verify(reference: string): Promise<VerifiedPayment>;
}

export const PAYMENT_GATEWAY_SERVICE = 'PAYMENT_GATEWAY_SERVICE';
