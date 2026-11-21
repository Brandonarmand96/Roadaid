"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  Check,
  ChevronRight,
  FileCheck2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Users,
  X,
  ReceiptText,
  SlidersHorizontal,
  Activity,
  Banknote,
  Download,
  MessageSquareText,
} from "lucide-react";
import { io } from "socket.io-client";
import { LiveMap } from "./LiveMap";

function apiBaseUrl(value?: string) {
  const base = (value ?? "http://localhost:3000").replace(/\/+$/, "");
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

const API = apiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
const ADMIN_TOKEN_KEY = "roadaid-admin-token";
const SESSION_EXPIRED_EVENT = "roadaid:admin-session-expired";
const SESSION_EXPIRED_MESSAGE = "Your session expired. Sign in again to continue.";
type Service = {
  id: string;
  serviceType: string;
  status: string;
  rejectionReason?: string | null;
};
type Document = {
  id: string;
  docType: string;
  status: string;
  note?: string | null;
  signedUrl?: string;
};
type Provider = {
  userId: string;
  onboardingStatus: string;
  businessName?: string | null;
  address?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehiclePlate?: string | null;
  rejectionReason?: string | null;
  user?: { fullName?: string | null; phone: string };
  services: Service[];
  documents?: Document[];
};
type PriceRule = {
  id: string;
  serviceType: string;
  baseKobo: number;
  perKmKobo: number;
  perLitreKobo: number;
  minKobo: number;
  towingFreeKm: number;
  active: boolean;
};
type DispatchSetting = { id: string; serviceType: string; offerTimeoutSeconds: number; searchRadiusKm: number; maxOffers: number; candidateShortlistSize: number; staleLocationSeconds: number; maxSearchDurationSeconds: number };
type RequestEvent = {
  id: string;
  type: string;
  actorType: string;
  createdAt: string;
};
type RoadRequest = {
  id: string;
  code: string;
  serviceType: string;
  status: string;
  paymentStatus: string;
  priceKobo: number;
  pickupAddress: string;
  createdAt: string;
  events?: RequestEvent[];
  customer?: { phone: string; fullName?: string | null };
};
type Dashboard = { requestsToday: number; activeJobs: number; completedToday: number; completionRateBps: number; onlineProviders: number; escalatedCount: number; revenueTodayKobo: number; avgTimeToAcceptSeconds: number };
type LiveProvider = { providerId: string; fullName?: string | null; availability: string; lat: number; lng: number; receivedAt: string };
type LiveSnapshot = { providers: LiveProvider[]; activeRequests: Array<{ id: string; code: string; serviceType: string; status: string; pickupAddress: string; etaSeconds?: number | null; lat: number; lng: number }>; serverNow: string };
type Payment = { id: string; requestId: string; reference: string; amountKobo: number; status: string; gateway: string; paidAt?: string | null; request: { code: string; serviceType: string; status: string; paymentStatus: string } };
type Payout = { id: string; amountKobo: number; status: string; requestedAt: string; paidReference?: string | null; provider: { user: { fullName?: string | null; phone: string } } };
type AdminRole = "SUPER_ADMIN" | "OPERATIONS" | "FINANCE";
type SupportCase = { id: string; requestId?: string | null; subject: string; message: string; status: string; createdAt: string; user: { fullName?: string | null; phone: string; role: string } };

function sessionFromToken(token: string): { role: AdminRole; expiresAt: number } | undefined {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))) as {
      adminRole?: AdminRole;
      exp?: number;
    };
    if (!decoded.adminRole || !decoded.exp) return undefined;
    return { role: decoded.adminRole, expiresAt: decoded.exp * 1000 };
  } catch {
    return undefined;
  }
}

function expireAdminSession() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

async function call<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && token) {
    expireAdminSession();
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  if (!response.ok)
    throw new Error(body.message ?? "The operation could not be completed.");
  return body as T;
}

export default function AdminHomePage() {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selected, setSelected] = useState<Provider>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [prices, setPrices] = useState<PriceRule[]>([]);
  const [dispatchSettings, setDispatchSettings] = useState<DispatchSetting[]>([]);
  const [requests, setRequests] = useState<RoadRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<RoadRequest>();
  const [adminRole, setAdminRole] = useState<AdminRole>("SUPER_ADMIN");
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [live, setLive] = useState<LiveSnapshot>();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [supportCases, setSupportCases] = useState<SupportCase[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");

  const endSession = useCallback((showExpiredMessage = false) => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken("");
    setDashboard(undefined);
    setLive(undefined);
    setSelected(undefined);
    setSelectedRequest(undefined);
    setProviders([]);
    setPrices([]);
    setDispatchSettings([]);
    setRequests([]);
    setPayments([]);
    setPayouts([]);
    setSupportCases([]);
    setError(showExpiredMessage ? SESSION_EXPIRED_MESSAGE : "");
  }, []);

  useEffect(() => {
    const handleSessionExpiry = () => endSession(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpiry);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpiry);
  }, [endSession]);

  useEffect(() => {
    const saved = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!saved) return;
    const session = sessionFromToken(saved);
    if (!session || session.expiresAt <= Date.now()) {
      endSession(true);
      return;
    }
    setToken(saved);
    setAdminRole(session.role);
    void load(saved).catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load dashboard data."));
    // Session bootstrap intentionally runs once; load reads the saved token passed above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endSession]);
  useEffect(() => {
    if (!token) return;
    const session = sessionFromToken(token);
    if (!session) {
      endSession(true);
      return;
    }
    const expiryTimer = window.setTimeout(
      () => endSession(true),
      Math.min(Math.max(session.expiresAt - Date.now(), 0), 2_147_483_647),
    );
    const socket = io(API.replace(/\/v1$/, ""), { auth: { token }, transports: ["websocket", "polling"] });
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { if (refreshTimer) clearTimeout(refreshTimer); refreshTimer = setTimeout(() => void load(token).catch(() => undefined), 500); };
    socket.on("request.updated", refresh);
    socket.on("admin.alert", refresh);
    socket.on("provider.availability", refresh);
    socket.on("provider.location", (position: { providerId: string; lat: number; lng: number; receivedAt: string }) => setLive((current) => current ? { ...current, providers: current.providers.map((provider) => provider.providerId === position.providerId ? { ...provider, ...position } : provider) } : current));
    return () => { window.clearTimeout(expiryTimer); if (refreshTimer) clearTimeout(refreshTimer); socket.disconnect(); };
    // Reconnect only when the authenticated token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endSession, token]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }
  async function login(event: React.FormEvent) {
    event.preventDefault();
    await act(async () => {
      const auth = await call<{ accessToken: string; user: { adminRole: AdminRole } }>(
        "/admin/auth/login",
        "",
        { method: "POST", body: JSON.stringify({ email, password }) },
      );
      localStorage.setItem(ADMIN_TOKEN_KEY, auth.accessToken);
      setToken(auth.accessToken);
      setAdminRole(auth.user.adminRole);
      await load(auth.accessToken);
    });
  }
  async function load(accessToken = token) {
    setLoadingData(true);
    try {
      const session = sessionFromToken(accessToken);
      if (!session || session.expiresAt <= Date.now()) {
        expireAdminSession();
        throw new Error(SESSION_EXPIRED_MESSAGE);
      }
      const role = session.role;
      setAdminRole(role);
      setDashboard(await call<Dashboard>("/admin/dashboard", accessToken));
      if (role !== "FINANCE") {
        const [providerData, priceData, dispatchData, requestData, liveData, supportData] = await Promise.all([
          call<Provider[]>("/admin/providers", accessToken), call<PriceRule[]>("/admin/pricing", accessToken), call<DispatchSetting[]>("/admin/dispatch-settings", accessToken), call<RoadRequest[]>("/admin/requests", accessToken), call<LiveSnapshot>("/admin/live", accessToken), call<SupportCase[]>("/admin/support-cases", accessToken),
        ]);
        setProviders(providerData); setPrices(priceData); setDispatchSettings(dispatchData); setRequests(requestData); setLive(liveData); setSupportCases(supportData);
        if (selected) await openProvider(selected.userId, accessToken);
      }
      if (role !== "OPERATIONS") {
        const [paymentData, payoutData] = await Promise.all([call<Payment[]>("/admin/payments", accessToken), call<Payout[]>("/admin/payouts", accessToken)]);
        setPayments(paymentData); setPayouts(payoutData);
      }
    } finally { setLoadingData(false); }
  }
  async function openProvider(id: string, accessToken = token) {
    const data = await call<Provider>(`/admin/providers/${id}`, accessToken);
    setSelected(data);
  }
  async function mutate(path: string, body?: object) {
    await act(async () => {
      await call(path, token, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
    });
  }
  function reject(path: string, field: "reason" | "note") {
    const reason = window.prompt(
      "Give the provider a clear reason and what they should correct.",
    );
    if (reason) void mutate(path, { [field]: reason });
  }
  async function editPrice(rule: PriceRule) {
    const base = window.prompt(
      `${rule.serviceType} base price in kobo`,
      String(rule.baseKobo),
    );
    if (base === null) return;
    const variable = window.prompt(
      rule.serviceType === "FUEL"
        ? "Price per litre in kobo"
        : "Price per kilometre in kobo",
      String(rule.serviceType === "FUEL" ? rule.perLitreKobo : rule.perKmKobo),
    );
    if (variable === null) return;
    await mutate(`/admin/pricing/${rule.serviceType}`, {
      baseKobo: Number(base),
      perKmKobo:
        rule.serviceType === "TOWING" ? Number(variable) : rule.perKmKobo,
      perLitreKobo:
        rule.serviceType === "FUEL" ? Number(variable) : rule.perLitreKobo,
      minKobo: rule.minKobo,
      towingFreeKm: rule.towingFreeKm,
      active: rule.active,
    });
  }
  async function editDispatch(setting: DispatchSetting) {
    const timeout = window.prompt(`${setting.serviceType} offer timeout in seconds`, String(setting.offerTimeoutSeconds));
    if (timeout === null) return;
    const radius = window.prompt(`${setting.serviceType} search radius in kilometres`, String(setting.searchRadiusKm));
    if (radius === null) return;
    const maxOffers = window.prompt(`${setting.serviceType} maximum sequential offers`, String(setting.maxOffers));
    if (maxOffers === null) return;
    await mutate(`/admin/dispatch-settings/${setting.serviceType}`, { ...setting, offerTimeoutSeconds: Number(timeout), searchRadiusKm: Number(radius), maxOffers: Number(maxOffers) });
  }
  async function openRequest(id: string) {
    await act(async () =>
      setSelectedRequest(
        await call<RoadRequest>(`/admin/requests/${id}`, token),
      ),
    );
  }
  async function redispatchRequest(id: string) {
    await act(async () => {
      await call(`/admin/requests/${id}/redispatch`, token, { method: "POST" });
      setSelectedRequest(
        await call<RoadRequest>(`/admin/requests/${id}`, token),
      );
      await load();
    });
  }
  async function cancelRequest(id: string) {
    const reason = window.prompt("Why is Operations cancelling this request?");
    if (!reason) return;
    await act(async () => {
      await call(`/admin/requests/${id}/cancel`, token, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setSelectedRequest(
        await call<RoadRequest>(`/admin/requests/${id}`, token),
      );
      await load();
    });
  }
  async function assignRequest(id: string) {
    await act(async () => {
      const providers = await call<
        Array<{
          userId: string;
          fullName?: string;
          phone: string;
          distanceM: number;
        }>
      >(`/admin/requests/${id}/eligible-providers`, token);
      if (!providers.length)
        throw new Error(
          "No approved online provider with fresh GPS is currently eligible.",
        );
      const choices = providers
        .map(
          (provider) =>
            `${provider.userId} — ${provider.fullName ?? provider.phone} (${Math.round(provider.distanceM)}m)`,
        )
        .join("\n");
      const providerId = window.prompt(
        `Copy the provider ID to assign:\n\n${choices}`,
      );
      if (!providerId) return;
      await call(`/admin/requests/${id}/assign`, token, {
        method: "POST",
        body: JSON.stringify({ providerId: providerId.trim() }),
      });
      setSelectedRequest(
        await call<RoadRequest>(`/admin/requests/${id}`, token),
      );
      await load();
    });
  }

  async function markRequestPaid(id: string) {
    const reason = window.prompt('Why is this payment being recorded manually?');
    if (!reason) return;
    await mutate(`/admin/requests/${id}/mark-paid`, { reason });
    await openRequest(id);
  }

  async function refundRequest(id: string) {
    const reason = window.prompt('Reason for the refund');
    if (!reason) return;
    const refundReference = window.prompt('Paystack or bank refund reference (optional)') || undefined;
    await mutate(`/admin/requests/${id}/refund`, { reason, refundReference });
    await openRequest(id);
  }

  async function decidePayout(id: string, approve: boolean) {
    const note = window.prompt(approve ? "Approval note (optional)" : "Why is this payout being rejected?");
    if (!approve && !note) return;
    await mutate(`/admin/payouts/${id}/${approve ? "approve" : "reject"}`, { note: note || undefined });
  }

  async function markPayoutPaid(id: string) {
    const reference = window.prompt("Enter the completed bank-transfer reference");
    if (!reference?.trim()) return;
    await mutate(`/admin/payouts/${id}/mark-paid`, { reference: reference.trim() });
  }

  async function downloadReport(kind: "requests" | "revenue" | "providers" | "payouts") {
    await act(async () => {
      const query = new URLSearchParams({ format: "csv" });
      if (reportFrom) query.set("from", `${reportFrom}T00:00:00+01:00`);
      if (reportTo) query.set("to", `${reportTo}T23:59:59+01:00`);
      const response = await fetch(`${API}/admin/reports/${kind}?${query}`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 401) {
        expireAdminSession();
        throw new Error(SESSION_EXPIRED_MESSAGE);
      }
      if (!response.ok) throw new Error("The report could not be generated. Check your permissions and try again.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `roadaid-${kind}.csv`; anchor.click(); URL.revokeObjectURL(url);
    });
  }

  if (!token)
    return (
      <main className="min-h-screen bg-[#191D23] text-slate-100 grid place-items-center p-6">
        <form onSubmit={login} className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-10">
            <BrandMark />
            <div>
              <h1 className="font-black text-xl">RoadAid Operations</h1>
              <p className="text-amber-300 text-[10px] font-black tracking-[0.18em]">
                BUILT FOR CERTAINTY
              </p>
            </div>
          </div>
          <h2 className="text-4xl font-black tracking-[-0.03em]">
            Review providers with confidence.
          </h2>
          <p className="text-slate-400 mt-3 leading-6">
            Secure access for Abuja Operations administrators.
          </p>
          {error && <ErrorMessage message={error} />}
          <div className="mt-8 space-y-5">
            <Field
              label="Work email"
              value={email}
              onChange={setEmail}
              type="email"
              autoComplete="email"
            />
            <Field
              label="Password"
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete="current-password"
            />
            <button
              disabled={busy}
              className="w-full h-14 rounded-[14px] bg-[#F4AE3E] text-[#191D23] font-black disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-[#F4AE3E]/30"
            >
              {busy ? "Signing in…" : "Sign in to Operations"}
            </button>
          </div>
        </form>
      </main>
    );

  return (
    <main className="min-h-screen bg-[#f5f1e8] text-slate-900">
      <header className="h-20 bg-[#191D23] text-white px-6 flex items-center justify-between border-b border-[#363B44]">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <h1 className="font-black">RoadAid Operations</h1>
            <p className="text-amber-300 text-[9px] font-black tracking-[0.18em]">
              ABUJA PROVIDER REVIEW
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="p-3 rounded-xl hover:bg-slate-800 focus:ring-2 focus:ring-amber-300"
            aria-label="Refresh providers"
          >
            <RefreshCw size={18} />
          </button>
          <button
            onClick={() => {
              endSession();
            }}
            className="p-3 rounded-xl hover:bg-slate-800 focus:ring-2 focus:ring-amber-300"
            aria-label="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <div className="max-w-[1440px] mx-auto p-6">
        <section className="mb-8" aria-busy={loadingData}>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-black tracking-[-0.03em]">Today across RoadAid</h2>
              <p className="text-slate-600 mt-2">Live operational and financial health for Abuja, shown in Lagos time.</p>
            </div>
            <Status value={loadingData ? "REFRESHING" : adminRole.replace("_", " ")} />
          </div>
          {dashboard ? (
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 border-y border-[#c8c1b4] divide-x divide-[#d8d2c5] bg-[#fffdf8]">
              <Metric label="Requests" value={dashboard.requestsToday} />
              <Metric label="Active jobs" value={dashboard.activeJobs} />
              <Metric label="Completed" value={dashboard.completedToday} />
              <Metric label="Completion" value={`${(dashboard.completionRateBps / 100).toFixed(1)}%`} />
              <Metric label="Online" value={dashboard.onlineProviders} />
              <Metric label="Escalated" value={dashboard.escalatedCount} alert={dashboard.escalatedCount > 0} />
              <Metric label="Revenue" value={money(dashboard.revenueTodayKobo)} />
              <Metric label="Accept time" value={`${dashboard.avgTimeToAcceptSeconds}s`} />
            </div>
          ) : <div className="mt-6 p-6 bg-[#fffdf8] border border-[#d8d2c5] rounded-2xl text-slate-600">Dashboard figures are unavailable. Refresh to try again.</div>}
        </section>
        {error && <ErrorMessage message={error} />}
        {adminRole !== "FINANCE" && <>
        {live && (
          <section className="mb-8 grid xl:grid-cols-[1.6fr_0.9fr] bg-[#191D23] text-white rounded-2xl overflow-hidden">
            <div className="min-h-[390px] bg-slate-200">
              <LiveMap providers={live.providers} requests={live.activeRequests} />
            </div>
            <div className="p-6 min-w-0">
              <div className="flex items-center gap-3"><Activity size={19} className="text-amber-300" /><h3 className="font-black text-xl">Live response field</h3></div>
              <p className="text-slate-300 text-sm mt-2">{live.providers.length} visible providers · {live.activeRequests.length} active requests</p>
              <div className="mt-5 divide-y divide-slate-700 max-h-[290px] overflow-y-auto">
                {live.activeRequests.length ? live.activeRequests.map((request) => <button key={request.id} onClick={() => void openRequest(request.id)} className="w-full text-left py-3 focus:outline-none focus:ring-2 focus:ring-amber-300 rounded"><div className="flex justify-between gap-3"><b className="truncate">{request.code}</b><span className="text-amber-300 text-xs font-black">{request.status}</span></div><p className="text-sm text-slate-300 truncate mt-1">{request.serviceType} · {request.pickupAddress}</p></button>) : <p className="py-8 text-slate-300">No active requests right now.</p>}
              </div>
            </div>
          </section>
        )}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-7">
          <div>
            <h2 className="text-3xl font-black tracking-[-0.03em]">
              Provider verification
            </h2>
            <p className="text-slate-600 mt-2">
              Review identity, equipment, and each service capability
              independently.
            </p>
          </div>
          <div className="flex gap-6 text-sm">
            <Stat
              icon={<Users size={17} />}
              label="Applicants"
              value={providers.length}
            />
            <Stat
              icon={<ShieldCheck size={17} />}
              label="Submitted"
              value={
                providers.filter((p) => p.onboardingStatus === "SUBMITTED")
                  .length
              }
            />
          </div>
        </div>
        <div className="grid lg:grid-cols-[minmax(320px,0.85fr)_minmax(480px,1.5fr)] bg-[#fffdf8] border border-[#d8d2c5] rounded-2xl overflow-hidden min-h-[620px]">
          <section className="border-r border-[#d8d2c5]">
            <div className="px-5 py-4 border-b border-[#d8d2c5] text-xs font-black tracking-wider text-slate-500">
              APPLICATION QUEUE
            </div>
            {providers.length === 0 ? (
              <Empty />
            ) : (
              providers.map((provider) => (
                <button
                  key={provider.userId}
                  onClick={() => void openProvider(provider.userId)}
                  className={`w-full text-left px-5 py-4 flex items-center gap-4 border-b border-[#e4ded3] hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-400 ${selected?.userId === provider.userId ? "bg-amber-50" : ""}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-200 grid place-items-center font-black text-slate-600">
                    {
                      (provider.user?.fullName ??
                        provider.businessName ??
                        "P")[0]
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-black truncate">
                        {provider.user?.fullName ??
                          provider.businessName ??
                          "Unnamed provider"}
                      </p>
                      <Status value={provider.onboardingStatus} />
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      {provider.user?.phone ??
                        provider.vehiclePlate ??
                        "Profile started"}
                    </p>
                  </div>
                  <ChevronRight size={17} className="text-slate-400" />
                </button>
              ))
            )}
          </section>
          <section>
            {selected ? (
              <ProviderDetail
                provider={selected}
                busy={busy}
                mutate={mutate}
                reject={reject}
              />
            ) : (
              <div className="h-full grid place-items-center p-12 text-center">
                <div>
                  <FileCheck2 size={42} className="mx-auto text-slate-400" />
                  <h3 className="font-black text-xl mt-4">
                    Select an application
                  </h3>
                  <p className="text-slate-500 mt-2 max-w-sm">
                    Open a provider to review documents and approve only the
                    services they are qualified to perform.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
        <div className="grid xl:grid-cols-2 gap-6 mt-8">
          <section className="bg-[#fffdf8] border border-[#d8d2c5] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#d8d2c5] flex items-center gap-3">
              <SlidersHorizontal size={18} className="text-amber-800" />
              <div>
                <h3 className="font-black">Pricing control</h3>
                <p className="text-sm text-slate-500">
                  All amounts are integer kobo and apply to new quotes.
                </p>
              </div>
            </div>
            <div className="divide-y divide-[#e4ded3]">
              {prices.map((rule) => (
                <div
                  key={rule.id}
                  className="p-5 flex items-center justify-between gap-5"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-black">{rule.serviceType}</p>
                      <Status value={rule.active ? "ACTIVE" : "INACTIVE"} />
                    </div>
                    <p className="text-sm text-slate-600 mt-2 tabular-nums">
                      Base {money(rule.baseKobo)} · Minimum{" "}
                      {money(rule.minKobo)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {rule.serviceType === "FUEL"
                        ? `${money(rule.perLitreKobo)} per litre`
                        : rule.serviceType === "TOWING"
                          ? `${money(rule.perKmKobo)} per km`
                          : "Fixed service price"}
                    </p>
                  </div>
                  <Action
                    label="Edit pricing"
                    onClick={() => void editPrice(rule)}
                  />
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-y border-[#d8d2c5]"><h3 className="font-black">Dispatch controls</h3><p className="text-sm text-slate-500 mt-1">Sequential offer timing and provider search limits.</p></div>
            <div className="divide-y divide-[#e4ded3]">{dispatchSettings.map((setting) => <div key={setting.id} className="p-5 flex items-center justify-between gap-5"><div><p className="font-black">{setting.serviceType}</p><p className="text-sm text-slate-600 mt-2 tabular-nums">{setting.offerTimeoutSeconds}s offer · {setting.searchRadiusKm}km radius · {setting.maxOffers} attempts</p><p className="text-xs text-slate-500 mt-1">Fresh GPS within {setting.staleLocationSeconds}s · search up to {Math.round(setting.maxSearchDurationSeconds / 60)} min</p></div><Action label="Edit dispatch" onClick={() => void editDispatch(setting)} /></div>)}</div>
          </section>
          <section className="bg-[#fffdf8] border border-[#d8d2c5] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#d8d2c5] flex items-center gap-3">
              <ReceiptText size={18} className="text-amber-800" />
              <div>
                <h3 className="font-black">Request queue</h3>
                <p className="text-sm text-slate-500">
                  Locked prices and state-event history.
                </p>
              </div>
            </div>
            {requests.length === 0 ? (
              <div className="p-10 text-center text-slate-500">
                Customer requests will appear here.
              </div>
            ) : (
              <div className="divide-y divide-[#e4ded3]">
                {requests.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => void openRequest(item.id)}
                    className="w-full p-5 text-left hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-400"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black">{item.code}</p>
                      <Status value={item.status} />
                    </div>
                    <p className="text-sm font-bold mt-2">
                      {item.serviceType} · {money(item.priceKobo)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      {item.pickupAddress}
                    </p>
                  </button>
                ))}
              </div>
            )}
            {selectedRequest && (
              <div className="p-5 bg-slate-50 border-t border-[#d8d2c5]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="font-black">{selectedRequest.code} timeline</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedRequest.status === 'ESCALATED' && <Action label="Re-dispatch" onClick={() => void redispatchRequest(selectedRequest.id)} />}
                    {['ESCALATED', 'SEARCHING'].includes(selectedRequest.status) && <Action label="Assign provider" onClick={() => void assignRequest(selectedRequest.id)} />}
                    {!['COMPLETED', 'CANCELLED'].includes(selectedRequest.status) && <Action label="Cancel" tone="danger" onClick={() => void cancelRequest(selectedRequest.id)} />}
                    {adminRole !== 'OPERATIONS' && selectedRequest.paymentStatus !== 'PAID' && selectedRequest.paymentStatus !== 'REFUNDED' && <Action label="Mark paid" onClick={() => void markRequestPaid(selectedRequest.id)} />}
                    {adminRole !== 'OPERATIONS' && selectedRequest.paymentStatus === 'PAID' && <Action label="Refund" tone="danger" onClick={() => void refundRequest(selectedRequest.id)} />}
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  {selectedRequest.events?.map((event) => (
                    <div
                      key={event.id}
                      className="flex justify-between gap-4 text-sm"
                    >
                      <span>
                        <b>{event.type}</b> · {event.actorType}
                      </span>
                      <time className="text-slate-500 tabular-nums">
                        {new Date(event.createdAt).toLocaleString("en-NG", {
                          timeZone: "Africa/Lagos",
                        })}
                      </time>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
        </>}
        {adminRole !== "FINANCE" && (
          <section className="mt-8 bg-[#fffdf8] border border-[#d8d2c5] rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-[#d8d2c5] flex items-center gap-3"><MessageSquareText size={19} className="text-amber-800" /><div><h3 className="font-black">Customer and provider support</h3><p className="text-sm text-slate-500">Persisted help requests assigned to Operations.</p></div></div>
            <div className="divide-y divide-[#e4ded3] max-h-[520px] overflow-y-auto">{supportCases.length ? supportCases.map((item) => <div key={item.id} className="p-5"><div className="flex items-start justify-between gap-4"><div><p className="font-black">{item.subject}</p><p className="text-sm text-slate-600 mt-1">{item.user.fullName || item.user.phone} · {item.user.role}</p><p className="text-sm mt-3 whitespace-pre-wrap">{item.message}</p><p className="text-xs text-slate-500 mt-2">{new Date(item.createdAt).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}{item.requestId ? ` · Request ${item.requestId}` : ""}</p></div><Status value={item.status} /></div><div className="flex flex-wrap gap-2 mt-4">{item.status === "OPEN" ? <Action label="Start review" onClick={() => void mutate(`/admin/support-cases/${item.id}/status`, { status: "IN_PROGRESS" })} /> : null}{item.status !== "RESOLVED" ? <Action label="Resolve" onClick={() => void mutate(`/admin/support-cases/${item.id}/status`, { status: "RESOLVED" })} /> : null}</div></div>) : <EmptyMessage title="No support cases" body="New customer and provider help requests will appear here." />}</div>
          </section>
        )}
        {adminRole !== "OPERATIONS" && (
          <section className="mt-8 grid xl:grid-cols-2 gap-6">
            <div className="bg-[#fffdf8] border border-[#d8d2c5] rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-[#d8d2c5] flex items-center justify-between gap-4"><div className="flex items-center gap-3"><Banknote size={19} className="text-amber-800" /><div><h3 className="font-black">Payments</h3><p className="text-sm text-slate-500">Latest customer collections and refunds.</p></div></div><Action label="Revenue CSV" onClick={() => void downloadReport("revenue")} /></div>
              <div className="divide-y divide-[#e4ded3] max-h-[520px] overflow-y-auto">{payments.length ? payments.map((payment) => {
                const isCommission = payment.reference.startsWith("RA-COM-");
                const isCash = payment.reference.startsWith("RA-CASH-");
                return <div key={payment.id} className="p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="font-black truncate">{payment.request.code}</p><p className="text-sm text-slate-600 mt-1 truncate">{isCommission ? "Provider commission settlement" : isCash ? "Cash collected by provider" : payment.gateway} · {payment.reference}</p><p className="text-xs text-slate-500 mt-1">{payment.request.serviceType}</p></div><div className="text-right shrink-0"><p className="font-black tabular-nums">{money(payment.amountKobo)}</p><Status value={payment.status} /></div></div>{!isCommission && !isCash ? <div className="flex flex-wrap gap-2 mt-4">{["PENDING", "FAILED"].includes(payment.status) && payment.request.paymentStatus !== "PAID" && <Action label="Mark request paid" onClick={() => void markRequestPaid(payment.requestId)} />}{payment.status === "PAID" && <Action label="Refund" tone="danger" onClick={() => void refundRequest(payment.requestId)} />}</div> : null}</div>;
              }) : <EmptyMessage title="No payments recorded" body="Customer payments and provider commission settlements will appear here." />}</div>
            </div>
            <div className="bg-[#fffdf8] border border-[#d8d2c5] rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-[#d8d2c5] flex items-center justify-between gap-4"><div><h3 className="font-black">Provider payouts</h3><p className="text-sm text-slate-500">Manual bank transfers with audited approval.</p></div><Action label="Payout CSV" onClick={() => void downloadReport("payouts")} /></div>
              <div className="divide-y divide-[#e4ded3] max-h-[520px] overflow-y-auto">{payouts.length ? payouts.map((payout) => <div key={payout.id} className="p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="font-black truncate">{payout.provider.user.fullName || payout.provider.user.phone}</p><p className="text-xs text-slate-500 mt-1">Requested {new Date(payout.requestedAt).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}</p></div><div className="text-right shrink-0"><p className="font-black tabular-nums">{money(payout.amountKobo)}</p><Status value={payout.status} /></div></div><div className="flex flex-wrap gap-2 mt-4">{payout.status === "REQUESTED" && <><Action label="Approve" onClick={() => void decidePayout(payout.id, true)} /><Action label="Reject" tone="danger" onClick={() => void decidePayout(payout.id, false)} /></>}{payout.status === "APPROVED" && <Action label="Record bank transfer" onClick={() => void markPayoutPaid(payout.id)} />}</div></div>) : <EmptyMessage title="No payout requests" body="Provider payout requests will appear here for review." />}</div>
            </div>
            <div className="xl:col-span-2 flex flex-wrap items-end gap-3 p-5 bg-[#191D23] text-white rounded-2xl"><Download size={18} className="text-[#F4AE3E] self-center" /><p className="font-black mr-auto self-center">Operational reports</p><label className="text-xs font-bold"><span className="block mb-1 text-slate-300">From</span><input type="date" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} className="h-10 rounded-xl bg-[#252A32] border border-slate-600 px-3 text-white focus:outline-none focus:ring-2 focus:ring-[#F4AE3E]" /></label><label className="text-xs font-bold"><span className="block mb-1 text-slate-300">To</span><input type="date" value={reportTo} min={reportFrom || undefined} onChange={(event) => setReportTo(event.target.value)} className="h-10 rounded-xl bg-[#252A32] border border-slate-600 px-3 text-white focus:outline-none focus:ring-2 focus:ring-[#F4AE3E]" /></label><Action label="Requests CSV" onClick={() => void downloadReport("requests")} /><Action label="Providers CSV" onClick={() => void downloadReport("providers")} /></div>
          </section>
        )}
      </div>
    </main>
  );
}

function money(kobo: number) {
  return `₦${Math.trunc(kobo / 100).toLocaleString("en-NG")}`;
}

function ProviderDetail({
  provider,
  busy,
  mutate,
  reject,
}: {
  provider: Provider;
  busy: boolean;
  mutate: (path: string, body?: object) => Promise<void>;
  reject: (path: string, field: "reason" | "note") => void;
}) {
  return (
    <div>
      <div className="p-6 border-b border-[#d8d2c5] flex flex-col sm:flex-row sm:items-start justify-between gap-5">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-2xl font-black">
              {provider.user?.fullName ??
                provider.businessName ??
                "Provider application"}
            </h3>
            <Status value={provider.onboardingStatus} />
          </div>
          <p className="text-slate-500 mt-2">
            {provider.address || "No operating address"} ·{" "}
            {provider.user?.phone}
          </p>
          <p className="font-bold mt-3">
            {provider.vehicleMake} {provider.vehicleModel}{" "}
            <span className="font-mono text-sm bg-slate-100 px-2 py-1 rounded ml-2">
              {provider.vehiclePlate}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Action
            label="Reject"
            tone="danger"
            disabled={busy}
            onClick={() =>
              reject(`/admin/providers/${provider.userId}/reject`, "reason")
            }
          />
          <Action
            label="Approve profile"
            disabled={busy}
            onClick={() =>
              void mutate(`/admin/providers/${provider.userId}/approve`)
            }
          />
        </div>
      </div>
      <div className="p-6">
        <h4 className="text-xs font-black tracking-wider text-slate-500 mb-3">
          SERVICE CAPABILITIES
        </h4>
        <div className="divide-y divide-[#ded8cc]">
          {provider.services.map((service) => (
            <div
              key={service.id}
              className="py-4 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <p className="font-black">{service.serviceType}</p>
                  <Status value={service.status} />
                </div>
                {service.rejectionReason && (
                  <p className="text-sm text-red-700 mt-2">
                    {service.rejectionReason}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Action
                  label="Reject"
                  tone="danger"
                  onClick={() =>
                    reject(
                      `/admin/providers/${provider.userId}/services/${service.serviceType}/reject`,
                      "reason",
                    )
                  }
                />
                <Action
                  label="Approve"
                  onClick={() =>
                    void mutate(
                      `/admin/providers/${provider.userId}/services/${service.serviceType}/approve`,
                    )
                  }
                />
              </div>
            </div>
          ))}
        </div>
        <h4 className="text-xs font-black tracking-wider text-slate-500 mt-8 mb-3">
          IDENTITY & VEHICLE DOCUMENTS
        </h4>
        <div className="divide-y divide-[#ded8cc]">
          {provider.documents?.map((document) => (
            <div
              key={document.id}
              className="py-4 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <p className="font-black">
                    {document.docType.replaceAll("_", " ")}
                  </p>
                  <Status value={document.status} />
                </div>
                {document.note && (
                  <p className="text-sm text-red-700 mt-2">{document.note}</p>
                )}
                {document.signedUrl && (
                  <a
                    className="inline-block text-sm font-bold text-amber-800 underline underline-offset-4 mt-2"
                    href={document.signedUrl}
                    target="_blank"
                  >
                    Open secure preview
                  </a>
                )}
              </div>
              <div className="flex gap-2">
                <Action
                  label="Reject"
                  tone="danger"
                  onClick={() =>
                    reject(`/admin/documents/${document.id}/reject`, "note")
                  }
                />
                <Action
                  label="Accept"
                  onClick={() =>
                    void mutate(`/admin/documents/${document.id}/accept`)
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function BrandMark() {
  return (
    <Image
      src="/roadaid-mark.svg"
      alt=""
      width={44}
      height={44}
      className="w-11 h-11 shrink-0 object-contain"
    />
  );
}
function Field({
  label,
  value,
  onChange,
  ...props
}: { label: string; value: string; onChange: (value: string) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value"
>) {
  return (
    <label className="block">
      <span className="block text-sm font-black mb-2">{label}</span>
      <input
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-14 rounded-[14px] border border-slate-600 bg-slate-900 px-4 text-white focus:outline-none focus:ring-4 focus:ring-amber-300/25 focus:border-amber-300"
      />
    </label>
  );
}
function Status({ value }: { value: string }) {
  const good = ["APPROVED", "PAID", "ACTIVE", "ONLINE"].includes(value);
  const bad = ["REJECTED", "SUSPENDED", "FAILED", "REFUNDED"].includes(value);
  return (
    <span
      className={`text-[10px] font-black tracking-wide px-2 py-1 rounded-full ${good ? "bg-emerald-100 text-emerald-800" : bad ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}
    >
      {value}
    </span>
  );
}
function Metric({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return <div className="px-4 py-5 min-w-0"><p className="text-xs text-slate-500">{label}</p><p className={`font-black tabular-nums mt-1 truncate ${alert ? "text-red-700" : "text-slate-900"}`} title={String(value)}>{value}</p></div>;
}
function EmptyMessage({ title, body }: { title: string; body: string }) {
  return <div className="p-10 text-center"><p className="font-black">{title}</p><p className="text-sm text-slate-500 mt-1">{body}</p></div>;
}
function Action({
  label,
  onClick,
  tone,
  disabled,
}: {
  label: string;
  onClick: () => void;
  tone?: "danger";
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`h-10 px-4 rounded-xl text-sm font-black focus:outline-none focus:ring-4 disabled:opacity-50 ${tone === "danger" ? "border border-red-300 text-red-800 hover:bg-red-50 focus:ring-red-100" : "bg-slate-900 text-white hover:bg-slate-700 focus:ring-slate-300"}`}
    >
      {tone === "danger" ? (
        <X size={15} className="inline mr-1" />
      ) : (
        <Check size={15} className="inline mr-1" />
      )}
      {label}
    </button>
  );
}
function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-amber-800">{icon}</span>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="font-black tabular-nums">{value}</p>
      </div>
    </div>
  );
}
function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mt-5 rounded-xl bg-red-100 text-red-900 px-4 py-3 font-semibold"
    >
      {message}
    </div>
  );
}
function Empty() {
  return (
    <div className="p-10 text-center">
      <Users className="mx-auto text-slate-400" />
      <p className="font-black mt-3">No applications yet</p>
      <p className="text-sm text-slate-500 mt-1">
        Submitted providers will appear here.
      </p>
    </div>
  );
}
