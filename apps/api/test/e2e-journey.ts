import { PrismaClient, ApprovalStatus, OnboardingStatus, ProviderAvailability, Role, ServiceType, UserStatus } from '@prisma/client';
import { io, Socket } from 'socket.io-client';

const prisma = new PrismaClient();
const api = (process.env.E2E_API_URL || 'http://127.0.0.1:3000/v1').replace(/\/$/, '');
const socketUrl = api.replace(/\/v1$/, '');
const otp = process.env.OTP_DEV_FIXED_CODE || '123456';
const suffix = String(Date.now()).slice(-8);
const customerPhone = `+23481${suffix}`;
const services = [ServiceType.FUEL, ServiceType.TOWING, ServiceType.LOCKOUT];
const providerPhones = services.map((_, index) => `+23482${suffix.slice(0, 7)}${index}`);
const createdUserIds: string[] = [];

async function http<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${api}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed (${response.status}): ${body.message || JSON.stringify(body)}`);
  return body as T;
}

async function loginPhone(phone: string) {
  await http('/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone }) });
  return http<{ accessToken: string; user: { id: string } }>('/auth/otp/verify', { method: 'POST', body: JSON.stringify({ phone, code: otp }) });
}

async function poll<T>(label: string, task: () => Promise<T>, ready: (value: T) => boolean, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await task();
    if (ready(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function details(service: ServiceType) {
  if (service === ServiceType.FUEL) return { fuelType: 'PETROL', litres: 5 };
  if (service === ServiceType.TOWING) return { destination: { lat: 9.0865, lng: 7.4086, address: 'E2E destination, Abuja' }, vehicleCondition: 'Does not start' };
  return { lockType: 'KEYS_INSIDE', notes: 'E2E locked vehicle' };
}

async function cleanup() {
  if (!createdUserIds.length) return;
  const requests = await prisma.serviceRequest.findMany({ where: { OR: [{ customerId: { in: createdUserIds } }, { providerId: { in: createdUserIds } }] }, select: { id: true } });
  const requestIds = requests.map(({ id }) => id);
  await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.deleteMany({ where: { OR: [{ requestId: { in: requestIds } }, { providerId: { in: createdUserIds } }] } });
    await tx.payment.deleteMany({ where: { requestId: { in: requestIds } } });
    await tx.providerLocationHistory.deleteMany({ where: { OR: [{ requestId: { in: requestIds } }, { providerId: { in: createdUserIds } }] } });
    await tx.dispatchOffer.deleteMany({ where: { requestId: { in: requestIds } } });
    await tx.requestEvent.deleteMany({ where: { requestId: { in: requestIds } } });
    await tx.serviceRequest.deleteMany({ where: { id: { in: requestIds } } });
    await tx.payoutRequest.deleteMany({ where: { providerId: { in: createdUserIds } } });
    await tx.providerBankAccount.deleteMany({ where: { providerId: { in: createdUserIds } } });
    await tx.providerLocation.deleteMany({ where: { providerId: { in: createdUserIds } } });
    await tx.providerDocument.deleteMany({ where: { providerId: { in: createdUserIds } } });
    await tx.providerService.deleteMany({ where: { providerId: { in: createdUserIds } } });
    await tx.providerProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await tx.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await tx.otpCode.deleteMany({ where: { phone: { in: [customerPhone, ...providerPhones] } } });
    await tx.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });
}

async function main() {
  const health = await fetch(`${socketUrl}/health`); if (!health.ok) throw new Error(`API health check failed (${health.status})`);
  const admin = await http<{ accessToken: string }>('/admin/auth/login', { method: 'POST', body: JSON.stringify({ email: process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@roadaid.co', password: process.env.ADMIN_BOOTSTRAP_PASSWORD || 'AdminSecurePassword2026!' }) });
  const customer = await loginPhone(customerPhone); createdUserIds.push(customer.user.id);
  const providers: Array<{ id: string; token: string; service: ServiceType }> = [];
  for (let index = 0; index < services.length; index++) {
    const firstLogin = await loginPhone(providerPhones[index]); createdUserIds.push(firstLogin.user.id);
    await prisma.user.update({ where: { id: firstLogin.user.id }, data: { role: Role.PROVIDER, status: UserStatus.ACTIVE, fullName: `E2E ${services[index]} Provider` } });
    await prisma.providerProfile.upsert({ where: { userId: firstLogin.user.id }, update: { onboardingStatus: OnboardingStatus.APPROVED, availability: ProviderAvailability.OFFLINE }, create: { userId: firstLogin.user.id, onboardingStatus: OnboardingStatus.APPROVED, availability: ProviderAvailability.OFFLINE, vehicleMake: 'Toyota', vehiclePlate: `E2E${index}` } });
    await prisma.providerService.upsert({ where: { providerId_serviceType: { providerId: firstLogin.user.id, serviceType: services[index] } }, update: { status: ApprovalStatus.APPROVED }, create: { providerId: firstLogin.user.id, serviceType: services[index], status: ApprovalStatus.APPROVED, details: {} } });
    const provider = await loginPhone(providerPhones[index]);
    await http('/provider/location', { method: 'POST', body: JSON.stringify({ lat: 9.0765 + index * 0.001, lng: 7.3986, accuracy: 8, recordedAt: new Date().toISOString() }) }, provider.accessToken);
    await http('/provider/availability', { method: 'POST', body: JSON.stringify({ state: 'ONLINE' }) }, provider.accessToken);
    providers.push({ id: provider.user.id, token: provider.accessToken, service: services[index] });
  }

  const socket: Socket = io(socketUrl, { auth: { token: customer.accessToken }, transports: ['websocket', 'polling'] });
  await new Promise<void>((resolve, reject) => { socket.once('connect', () => resolve()); socket.once('connect_error', reject); });
  let realtimeUpdates = 0; socket.on('request.updated', () => realtimeUpdates++);

  for (const provider of providers) {
    const created = await http<{ id: string; code: string; priceKobo: number; pickupPin: string }>('/requests', { method: 'POST', body: JSON.stringify({ serviceType: provider.service, pickup: { lat: 9.0765, lng: 7.3986, address: 'E2E pickup, Abuja', note: 'Automated Phase 4 journey' }, details: details(provider.service) }) }, customer.accessToken);
    socket.emit('join:request', { requestId: created.id });
    const offers = await poll('dispatch offer', () => http<Array<{ id: string; requestId: string }>>('/provider/offers', {}, provider.token), (value) => value.some((offer) => offer.requestId === created.id));
    const offer = offers.find((item) => item.requestId === created.id)!;
    await http(`/provider/offers/${offer.id}/accept`, { method: 'POST' }, provider.token);
    await http(`/admin/requests/${created.id}/mark-paid`, { method: 'POST', body: JSON.stringify({ reason: 'Phase 4 automated paid journey' }) }, admin.accessToken);
    for (const status of ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED']) await http(`/provider/jobs/${created.id}/status`, { method: 'POST', body: JSON.stringify({ status, pickupPin: status === 'ARRIVED' ? created.pickupPin : undefined }) }, provider.token);
    const completed = await http<{ status: string; paymentStatus: string }>('/requests/' + created.id, {}, customer.accessToken);
    if (completed.status !== 'COMPLETED' || completed.paymentStatus !== 'PAID') throw new Error(`${provider.service}: terminal state mismatch`);
    const entries = await prisma.ledgerEntry.findMany({ where: { requestId: created.id } });
    const paid = entries.find((entry) => entry.type === 'CUSTOMER_PAYMENT')?.amountKobo || 0n;
    const commission = entries.find((entry) => entry.type === 'PLATFORM_COMMISSION')?.amountKobo || 0n;
    const earning = entries.find((entry) => entry.type === 'PROVIDER_EARNING')?.amountKobo || 0n;
    if (paid !== BigInt(created.priceKobo) || commission + earning !== paid) throw new Error(`${provider.service}: ledger does not reconcile to the kobo`);
    const profile = await prisma.providerProfile.findUniqueOrThrow({ where: { userId: provider.id } });
    if (profile.currentRequestId) throw new Error(`${provider.service}: provider was not released`);
    console.log(`PASS ${provider.service}: ${created.code}, ${paid} kobo, commission ${commission}, earning ${earning}`);
  }
  socket.disconnect();
  if (realtimeUpdates === 0) throw new Error('No realtime request update was observed');
  console.log(`PASS realtime: ${realtimeUpdates} request updates observed`);
  console.log('PASS Phase 4 paid journey: all three services reconciled exactly');
}

main().catch((error) => { console.error(`FAIL Phase 4 journey: ${(error as Error).message}`); process.exitCode = 1; }).finally(async () => { await cleanup().catch((error) => console.error('Cleanup warning:', error)); await prisma.$disconnect(); });
