"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";

function apiBaseUrl(value?: string) {
  const base = (value ?? "http://localhost:3000").replace(/\/+$/, "");
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

const API = apiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
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
  priceKobo: number;
  pickupAddress: string;
  createdAt: string;
  events?: RequestEvent[];
  customer?: { phone: string; fullName?: string | null };
};

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

  useEffect(() => {
    const saved = localStorage.getItem("roadaid-admin-token");
    if (!saved) return;
    setToken(saved);
    Promise.all([
      call<Provider[]>("/admin/providers", saved),
      call<PriceRule[]>("/admin/pricing", saved),
      call<DispatchSetting[]>("/admin/dispatch-settings", saved),
      call<RoadRequest[]>("/admin/requests", saved),
    ])
      .then(([providerData, priceData, dispatchData, requestData]) => {
        setProviders(providerData);
        setPrices(priceData);
        setDispatchSettings(dispatchData);
        setRequests(requestData);
      })
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load Operations data.",
        ),
      );
  }, []);
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
      const auth = await call<{ accessToken: string }>(
        "/admin/auth/login",
        "",
        { method: "POST", body: JSON.stringify({ email, password }) },
      );
      localStorage.setItem("roadaid-admin-token", auth.accessToken);
      setToken(auth.accessToken);
      await load(auth.accessToken);
    });
  }
  async function load(accessToken = token) {
    const [providerData, priceData, dispatchData, requestData] = await Promise.all([
      call<Provider[]>("/admin/providers", accessToken),
      call<PriceRule[]>("/admin/pricing", accessToken),
      call<DispatchSetting[]>("/admin/dispatch-settings", accessToken),
      call<RoadRequest[]>("/admin/requests", accessToken),
    ]);
    setProviders(providerData);
    setPrices(priceData);
    setDispatchSettings(dispatchData);
    setRequests(requestData);
    if (selected) await openProvider(selected.userId, accessToken);
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

  if (!token)
    return (
      <main className="min-h-screen bg-[#101827] text-slate-100 grid place-items-center p-6">
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
              className="w-full h-14 rounded-[14px] bg-amber-400 text-[#101827] font-black disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-amber-200/30"
            >
              {busy ? "Signing in…" : "Sign in to Operations"}
            </button>
          </div>
        </form>
      </main>
    );

  return (
    <main className="min-h-screen bg-[#f5f1e8] text-slate-900">
      <header className="h-[76px] bg-[#101827] text-white px-6 flex items-center justify-between border-b border-slate-700">
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
              localStorage.removeItem("roadaid-admin-token");
              setToken("");
            }}
            className="p-3 rounded-xl hover:bg-slate-800 focus:ring-2 focus:ring-amber-300"
            aria-label="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <div className="max-w-[1440px] mx-auto p-6">
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
        {error && <ErrorMessage message={error} />}
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
    <div className="w-10 h-10 rounded-xl bg-amber-400 text-[#101827] grid place-items-center font-black">
      RA
    </div>
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
  const good = value === "APPROVED";
  const bad = ["REJECTED", "SUSPENDED"].includes(value);
  return (
    <span
      className={`text-[10px] font-black tracking-wide px-2 py-1 rounded-full ${good ? "bg-emerald-100 text-emerald-800" : bad ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}
    >
      {value}
    </span>
  );
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
