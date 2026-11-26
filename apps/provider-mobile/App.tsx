import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  Linking,
  AppState,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { fetch as expoFetch } from "expo/fetch";
import { File } from "expo-file-system";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { OnboardingStatus, Role, ServiceType } from "@roadaid/shared";
import { io } from "socket.io-client";
import MapView, { Marker, Polyline } from "react-native-maps";
import { Check, ChevronRight, Clock3, Crosshair, FileCheck2, Navigation, Power, ShieldCheck, UploadCloud, UserRound } from "lucide-react-native";
import CustomerExperience from "./CustomerExperience";
import ServiceIcon from "./ServiceIcon";

declare const process: { env: { EXPO_PUBLIC_API_URL?: string; EXPO_PUBLIC_EAS_PROJECT_ID?: string } };

function apiBaseUrl(value?: string) {
  const base = (value ?? "http://10.0.2.2:3000").replace(/\/+$/, "");
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

const API = apiBaseUrl(process.env.EXPO_PUBLIC_API_URL);
const ACCESS_TOKEN_KEY = "provider-access-token";
const REFRESH_TOKEN_KEY = "provider-refresh-token";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const LOCATION_TASK = "roadaid-provider-location";
const LOCATION_BUFFER_KEY = "provider-location-buffer";
type LocationPoint = { lat: number; lng: number; accuracy: number; heading?: number; speed?: number; recordedAt: string };
type Wallet = { balanceKobo: number; cashCommissionDueKobo: number; cashCommissionLimitKobo: number; cashCommissionRemainingKobo: number; commissionBlocked: boolean; cashCommissions: Array<{ requestId: string; code: string; amountKobo: number }>; entries: Array<{ id: string; requestId?: string | null; type: string; amountKobo: number; description: string; createdAt: string }> };
type Payout = { id: string; amountKobo: number; status: string; requestedAt: string; paidReference?: string | null };
type ProviderJobHistory = { id: string; code: string; serviceType: string; status: string; pickupAddress: string; priceKobo: number; completedAt?: string | null; providerRatingToCustomer?: number | null; beneficiaryName?: string | null; customer?: { fullName?: string | null } };
type InboxNotification = { id: string; title: string; body: string; readAt?: string | null; createdAt: string };
type Step =
  "phone" | "otp" | "profile" | "services" | "documents" | "review" | "status";
type Service = {
  id: string;
  serviceType: ServiceType;
  status: string;
  rejectionReason?: string | null;
};
type Document = {
  id: string;
  docType: string;
  status: string;
  note?: string | null;
};
type Profile = {
  onboardingStatus: OnboardingStatus;
  availability?: string;
  businessName?: string;
  address?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehiclePlate?: string;
  rejectionReason?: string | null;
  services: Service[];
  documents: Document[];
};
type Session = { accessToken: string; refreshToken: string };
type AuthSession = Session & { isNewUser: boolean; user: { role: Role } };
type AccountIntent = "CUSTOMER" | "PROVIDER";
type AppMode = "CUSTOMER" | "PROVIDER";
type Offer = {
  id: string;
  expiresAt: string;
  serverNow?: string;
  localDeadlineMs?: number;
  etaSecondsAtOffer?: number;
  request: {
    code: string;
    serviceType: string;
    pickupAddress: string;
    priceKobo: number;
    commissionBps: number;
    commissionKobo: number;
    providerNetKobo: number;
    paymentMode: string;
    distanceKm?: number | null;
    details: unknown;
  };
};
type Job = {
  id: string;
  code: string;
  serviceType: string;
  status: string;
  pickupAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  customer?: { fullName?: string; phone: string };
  beneficiaryName?: string | null;
  beneficiaryPhone?: string | null;
  paymentMode?: string;
  paymentStatus?: string;
  priceKobo?: number;
};
type MapPoint = { latitude: number; longitude: number; accuracy?: number | null; recordedAt?: string };

function normalizeJob(value: unknown): Job | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Job> & { request?: Partial<Job> };
  const source = candidate.request && typeof candidate.request === "object"
    ? { ...candidate.request, id: candidate.request.id ?? candidate.id }
    : candidate;
  if (!source.id) return null;
  return {
    id: source.id,
    code: source.code ?? "",
    serviceType: source.serviceType ?? "",
    status: source.status ?? "",
    pickupAddress: source.pickupAddress ?? "",
    pickupLat: source.pickupLat,
    pickupLng: source.pickupLng,
    customer: source.customer,
    beneficiaryName: source.beneficiaryName,
    beneficiaryPhone: source.beneficiaryPhone,
    paymentMode: source.paymentMode,
    paymentStatus: source.paymentStatus,
    priceKobo: source.priceKobo,
  };
}

function normalizeOffers(values: Offer[]) {
  const receivedAt = Date.now();
  return values.map((offer) => {
    const serverNow = offer.serverNow ? Date.parse(offer.serverNow) : receivedAt;
    const remainingMs = Math.max(0, Date.parse(offer.expiresAt) - serverNow);
    return { ...offer, localDeadlineMs: receivedAt + remainingMs };
  });
}

function openNavigation(job: Job) {
  if (!Number.isFinite(job.pickupLat) || !Number.isFinite(job.pickupLng)) return;
  const coordinates = `${job.pickupLat},${job.pickupLng}`;
  const url = Platform.OS === "ios"
    ? `http://maps.apple.com/?daddr=${coordinates}`
    : `google.navigation:q=${coordinates}`;
  void Linking.openURL(url);
}

function onboardingMessage(profile?: Profile) {
  if (profile?.rejectionReason) return profile.rejectionReason;
  if (profile?.onboardingStatus === OnboardingStatus.APPROVED) {
    return "Your provider account is approved. Complete the location check to go online and receive matching offers.";
  }
  if (profile?.onboardingStatus === OnboardingStatus.REJECTED) {
    return "Your application needs changes before it can be approved. Review the requested updates below.";
  }
  return "RoadAid Operations is reviewing your application.";
}

let currentSession: Session | undefined;
let refreshInFlight: Promise<Session> | undefined;

function roleFromToken(token: string): Role | undefined {
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="))).role as Role;
  } catch {
    return undefined;
  }
}

async function readLocationBuffer(): Promise<LocationPoint[]> {
  try { return JSON.parse(await SecureStore.getItemAsync(LOCATION_BUFFER_KEY) || "[]") as LocationPoint[]; }
  catch { return []; }
}
async function writeLocationBuffer(points: LocationPoint[]) { await SecureStore.setItemAsync(LOCATION_BUFFER_KEY, JSON.stringify(points.slice(-200))); }
async function postLocationPoints(points: LocationPoint[], accessToken: string) {
  const response = await fetch(`${API}/provider/location/batch`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ points }) });
  if (!response.ok) throw new Error(`Location delivery failed (${response.status})`);
}
async function flushLocationBuffer(accessToken: string, additions: LocationPoint[] = []) {
  const cutoff = Date.now() - 5 * 60_000;
  const points = [...await readLocationBuffer(), ...additions].filter((point) => Date.parse(point.recordedAt) >= cutoff).sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt)).slice(-200);
  if (!points.length) return;
  try { await postLocationPoints(points, accessToken); await writeLocationBuffer([]); }
  catch { await writeLocationBuffer(points); }
}
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  const locations = (data as { locations?: Location.LocationObject[] }).locations || [];
  const points = locations.map((location) => ({ lat: location.coords.latitude, lng: location.coords.longitude, accuracy: location.coords.accuracy ?? 0, heading: location.coords.heading ?? undefined, speed: location.coords.speed ?? undefined, recordedAt: new Date(location.timestamp).toISOString() }));
  if (accessToken) await flushLocationBuffer(accessToken, points);
  else await writeLocationBuffer([...await readLocationBuffer(), ...points]);
});

async function saveSession(session: Session) {
  currentSession = session;
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken),
  ]);
}

async function clearSession() {
  currentSession = undefined;
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

async function fetchWithTimeout(url: string, options: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await expoFetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "The request timed out. Check your connection and try again.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshSession(): Promise<Session> {
  if (!currentSession?.refreshToken)
    throw new Error("Your session has expired. Please sign in again.");
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await fetchWithTimeout(`${API}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: currentSession?.refreshToken }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.accessToken || !data.refreshToken) {
        await clearSession();
        throw new Error("Your session has expired. Please sign in again.");
      }
      const session = data as Session;
      await saveSession(session);
      return session;
    })().finally(() => {
      refreshInFlight = undefined;
    });
  }
  return refreshInFlight;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  canRefresh = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const accessToken = token ?? currentSession?.accessToken;
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetchWithTimeout(`${API}${path}`, {
    ...options,
    headers,
  });
  if (
    response.status === 401 &&
    canRefresh &&
    currentSession?.refreshToken &&
    path !== "/auth/refresh"
  ) {
    const refreshed = await refreshSession();
    return request<T>(path, options, refreshed.accessToken, false);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      data.message ?? "Please check your connection and try again.",
    );
  return data as T;
}

export default function App() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("+234");
  const [code, setCode] = useState("");
  const [token, setToken] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<Profile>();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [wallet, setWallet] = useState<Wallet>();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [bank, setBank] = useState({ bankName: "", accountNumber: "", accountName: "" });
  const [payoutNaira, setPayoutNaira] = useState("");
  const [trackingState, setTrackingState] = useState<"OFF" | "IDLE" | "ACTIVE">("OFF");
  const [role, setRole] = useState<Role>();
  const [intent, setIntent] = useState<AccountIntent>("CUSTOMER");
  const [mode, setMode] = useState<AppMode>("CUSTOMER");
  const [newProviderEnrollment, setNewProviderEnrollment] = useState(false);
  const [providerPoint, setProviderPoint] = useState<MapPoint>();
  const [showProviderAccount, setShowProviderAccount] = useState(false);
  const [pendingCommissionReference, setPendingCommissionReference] = useState<string>();
  const [pickupPin, setPickupPin] = useState("");
  const [providerJobs, setProviderJobs] = useState<ProviderJobHistory[]>([]);
  const [providerNotifications, setProviderNotifications] = useState<InboxNotification[]>([]);
  const [form, setForm] = useState({
    businessName: "",
    address: "",
    vehicleMake: "",
    vehicleModel: "",
    vehiclePlate: "",
  });

  useEffect(() => {
    Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    ]).then(([accessToken, refreshToken]) => {
      if (accessToken && refreshToken) {
        currentSession = { accessToken, refreshToken };
        setToken(accessToken);
        const storedRole = roleFromToken(accessToken);
        setRole(storedRole);
        if (storedRole === Role.PROVIDER) {
          setMode("PROVIDER");
          void load(accessToken);
        } else {
          setMode("CUSTOMER");
        }
      }
    });
  }, []);
  useEffect(() => {
    if (!token || profile?.onboardingStatus !== OnboardingStatus.APPROVED)
      return;
    const refresh = () =>
      Promise.all([
        request<Offer[]>("/provider/offers", {}, token),
        request<unknown>("/provider/jobs/current", {}, token),
      ])
        .then(([nextOffers, nextJob]) => {
          setOffers(normalizeOffers(nextOffers));
          setJob(normalizeJob(nextJob));
        })
        .catch(() => undefined);
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [token, profile?.onboardingStatus]);
  useEffect(() => {
    if (!token || profile?.onboardingStatus !== OnboardingStatus.APPROVED) return;
    void Promise.all([request<Wallet>("/provider/wallet", {}, token), request<Payout[]>("/provider/payouts", {}, token)])
      .then(([nextWallet, nextPayouts]) => { setWallet(nextWallet); setPayouts(nextPayouts); })
      .catch(() => undefined);
  }, [token, profile?.onboardingStatus, job?.status]);
  useEffect(() => {
    if (!token || !showProviderAccount || role !== Role.PROVIDER) return;
    void Promise.all([
      request<ProviderJobHistory[]>("/provider/jobs", {}, token),
      request<InboxNotification[]>("/notifications", {}, token),
    ]).then(([jobs, notifications]) => { setProviderJobs(jobs); setProviderNotifications(notifications); }).catch(() => undefined);
  }, [showProviderAccount, token, role]);
  useEffect(() => {
    if (!token || !pendingCommissionReference) return;
    let active = true;
    const verify = async () => {
      if (AppState.currentState !== "active") return;
      const payment = await request<{ status: string }>(`/payments/${encodeURIComponent(pendingCommissionReference)}/status`, {}, token).catch(() => undefined);
      if (active && payment?.status === "PAID") {
        setWallet(await request<Wallet>("/provider/wallet", {}, token));
        setPendingCommissionReference(undefined);
      }
    };
    void verify();
    const timer = setInterval(() => void verify(), 2500);
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void verify(); });
    return () => { active = false; clearInterval(timer); subscription.remove(); };
  }, [pendingCommissionReference, token]);
  useEffect(() => {
    if (!token || profile?.onboardingStatus !== OnboardingStatus.APPROVED) return;
    const configure = async () => {
      const shouldTrack = Boolean(job || ["ONLINE", "RESERVED", "BUSY"].includes(profile.availability || ""));
      if (!shouldTrack) {
        if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
        setTrackingState("OFF");
        return;
      }
      const foreground = await Location.getForegroundPermissionsAsync();
      const background = await Location.getBackgroundPermissionsAsync();
      if (!foreground.granted || !background.granted) { setTrackingState("OFF"); return; }
      const lastPosition = await Location.getLastKnownPositionAsync();
      if (lastPosition) setProviderPoint({ latitude: lastPosition.coords.latitude, longitude: lastPosition.coords.longitude, accuracy: lastPosition.coords.accuracy, recordedAt: new Date(lastPosition.timestamp).toISOString() });
      const active = Boolean(job && ["ASSIGNED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"].includes(job.status));
      if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: active ? Location.Accuracy.High : Location.Accuracy.Balanced,
        timeInterval: active ? 5000 : 30000,
        distanceInterval: active ? 10 : 100,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: active,
        foregroundService: { notificationTitle: "RoadAid: You’re online", notificationBody: active ? "Sharing live location for your active job" : "Ready to receive nearby roadside requests", notificationColor: "#F4AE3E" },
      });
      setTrackingState(active ? "ACTIVE" : "IDLE");
      await flushLocationBuffer(token);
    };
    void configure().catch(() => setTrackingState("OFF"));
  }, [token, profile?.onboardingStatus, profile?.availability, job?.status]);
  useEffect(() => {
    if (!token || !role || !process.env.EXPO_PUBLIC_EAS_PROJECT_ID) return;
    const register = async () => {
      if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("offers", { name: "RoadAid offers", importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 300, 150, 300] });
      const permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) return;
      const push = await Notifications.getExpoPushTokenAsync({ projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID });
      await request("/devices", { method: "POST", body: JSON.stringify({ platform: Platform.OS === "ios" ? "IOS" : "ANDROID", token: push.data, app: role === Role.PROVIDER ? "PROVIDER" : "CUSTOMER" }) }, token);
    };
    void register().catch(() => undefined);
  }, [role, token]);
  useEffect(() => {
    if (!token || profile?.onboardingStatus !== OnboardingStatus.APPROVED) return;
    const socket = io(API.replace(/\/v1$/, ""), { auth: { token }, transports: ["websocket", "polling"] });
    const refresh = () => Promise.all([request<Offer[]>("/provider/offers", {}, token), request<unknown>("/provider/jobs/current", {}, token)]).then(([nextOffers, nextJob]) => { setOffers(normalizeOffers(nextOffers)); setJob(normalizeJob(nextJob)); }).catch(() => undefined);
    socket.on("offer.new", refresh);
    socket.on("offer.expired", refresh);
    socket.on("offer.cancelled", refresh);
    socket.on("request.updated", refresh);
    return () => { socket.disconnect(); };
  }, [token, profile?.onboardingStatus]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unexpected error";
      setError(message);
      if (message.includes("session has expired")) {
        setToken(undefined);
        setStep("phone");
      }
    } finally {
      setBusy(false);
    }
  }
  async function load(accessToken: string) {
    await act(async () => {
      const data = await request<Profile>("/provider/profile", {}, accessToken);
      setProfile(data);
      setServices(data.services.map((item) => item.serviceType));
      setForm({
        businessName: data.businessName ?? "",
        address: data.address ?? "",
        vehicleMake: data.vehicleMake ?? "",
        vehicleModel: data.vehicleModel ?? "",
        vehiclePlate: data.vehiclePlate ?? "",
      });
      setStep(
        [
          OnboardingStatus.SUBMITTED,
          OnboardingStatus.APPROVED,
          OnboardingStatus.SUSPENDED,
        ].includes(data.onboardingStatus)
          ? "status"
          : "profile",
      );
    });
  }
  async function sendOtp() {
    await act(async () => {
      await request("/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      setStep("otp");
    });
  }
  async function verify() {
    await act(async () => {
      const auth = await request<AuthSession>("/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ phone, code }),
      });
      await saveSession(auth);
      setToken(auth.accessToken);
      setRole(auth.user.role);
      if (auth.user.role === Role.PROVIDER) {
        setMode(intent);
        if (intent === "PROVIDER") await load(auth.accessToken);
        else setStep("status");
        return;
      }
      if (intent === "PROVIDER") {
        if (!auth.isNewUser) {
          setMode("CUSTOMER");
          setStep("status");
          throw new Error("This number belongs to a customer account. Customer accounts cannot be converted into provider accounts.");
        }
        setNewProviderEnrollment(true);
        setMode("PROVIDER");
        setStep("profile");
        return;
      }
      setMode("CUSTOMER");
      setStep("status");
    });
  }
  async function saveProfile() {
    if (!token) return;
    await act(async () => {
      await request(
        "/provider/profile",
        { method: "PUT", body: JSON.stringify(form) },
        token,
      );
      if (newProviderEnrollment) {
        const refreshed = await refreshSession();
        setToken(refreshed.accessToken);
        setRole(Role.PROVIDER);
        setNewProviderEnrollment(false);
      }
      setStep("services");
    });
  }
  async function saveServices() {
    if (!token || !services.length)
      return setError("Choose at least one service.");
    await act(async () => {
      for (const serviceType of services)
        await request(
          "/provider/services",
          {
            method: "POST",
            body: JSON.stringify({
              serviceType,
              details:
                serviceType === ServiceType.FUEL
                  ? {
                      containerCapacityLitres: 25,
                      fuelTypes: ["PETROL", "DIESEL"],
                    }
                  : serviceType === ServiceType.TOWING
                    ? {
                        truckType: "FLATBED",
                        maxVehicleWeightKg: 3500,
                        plate: form.vehiclePlate,
                      }
                    : { toolsDescription: "Professional lockout kit" },
            }),
          },
          token,
        );
      setStep("documents");
    });
  }
  async function upload(docType: string) {
    if (!token) return;
    const picked = await File.pickFileAsync({
      mimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    });
    if (picked.canceled) return;
    await act(async () => {
      const file = picked.result;
      if (file.size > MAX_DOCUMENT_BYTES)
        throw new Error(
          "File size must not exceed 8 MB. Choose a smaller document.",
        );
      const body = new FormData();
      body.append("docType", docType);
      body.append("file", file, file.name);
      await request("/provider/documents", { method: "POST", body }, token);
      setProfile(await request<Profile>("/provider/profile", {}, token));
    });
  }
  async function submit() {
    if (!token) return;
    await act(async () => {
      await request("/provider/submit", { method: "POST" }, token);
      await load(token);
    });
  }
  async function goOnline() {
    if (!token) return;
    await act(async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted)
        throw new Error("Location permission is required to receive jobs.");
      const background = await Location.requestBackgroundPermissionsAsync();
      if (!background.granted) throw new Error("Choose ‘Allow all the time’ in location settings so customers can track active jobs when your phone is locked.");
      const point = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setProviderPoint({ latitude: point.coords.latitude, longitude: point.coords.longitude, accuracy: point.coords.accuracy, recordedAt: new Date(point.timestamp).toISOString() });
      await request(
        "/provider/location",
        {
          method: "POST",
          body: JSON.stringify({
            lat: point.coords.latitude,
            lng: point.coords.longitude,
            accuracy: point.coords.accuracy ?? 0,
            heading: point.coords.heading ?? undefined,
            speed: point.coords.speed ?? undefined,
            recordedAt: new Date(point.timestamp).toISOString(),
          }),
        },
        token,
      );
      await request(
        "/provider/availability",
        { method: "POST", body: JSON.stringify({ state: "ONLINE" }) },
        token,
      );
      await load(token);
    });
  }
  async function saveBank() {
    if (!token) return;
    await act(async () => { await request("/provider/bank-account", { method: "PUT", body: JSON.stringify(bank) }, token); });
  }
  async function requestPayout() {
    if (!token) return;
    if (!/^\d+$/.test(payoutNaira)) return setError("Enter a whole-naira payout amount greater than zero.");
    const amountKobo = BigInt(payoutNaira) * 100n;
    if (amountKobo <= 0n) return setError("Enter a whole-naira payout amount greater than zero.");
    await act(async () => { await request("/provider/payouts", { method: "POST", body: JSON.stringify({ amountKobo: amountKobo.toString() }) }, token); setPayouts(await request<Payout[]>("/provider/payouts", {}, token)); setPayoutNaira(""); });
  }
  async function respondToOffer(id: string, accept: boolean) {
    if (!token) return;
    await act(async () => {
      try {
        await request(
          `/provider/offers/${id}/${accept ? "accept" : "decline"}`,
          {
            method: "POST",
            body: accept
              ? undefined
              : JSON.stringify({ reason: "Not available for this job" }),
          },
          token,
        );
      } finally {
        const [nextOffers, nextJob] = await Promise.all([
          request<Offer[]>("/provider/offers", {}, token),
          request<unknown>("/provider/jobs/current", {}, token),
        ]);
        setOffers(normalizeOffers(nextOffers));
        setJob(normalizeJob(nextJob));
      }
    });
  }
  async function progressJob(status: string) {
    if (!token || !job) return;
    if (status === "ARRIVED" && !/^\d{4}$/.test(pickupPin)) return setError("Enter the customer’s 4-digit pickup PIN before marking arrival.");
    await act(async () => {
      setJob(
        await request<Job>(
          `/provider/jobs/${job.id}/status`,
          { method: "POST", body: JSON.stringify({ status, pickupPin: status === "ARRIVED" ? pickupPin : undefined }) },
          token,
        ),
      );
      if (status === "ARRIVED") setPickupPin("");
    });
  }
  async function collectCash() {
    if (!token || !job) return;
    await act(async () => {
      await request("/payments/cash/collect", { method: "POST", body: JSON.stringify({ requestId: job.id }) }, token);
      setJob(normalizeJob(await request<unknown>("/provider/jobs/current", {}, token)));
      setWallet(await request<Wallet>("/provider/wallet", {}, token));
    });
  }
  async function settleCommission(requestId: string) {
    if (!token) return;
    await act(async () => {
      const initialized = await request<{ reference: string; authorizationUrl: string }>("/payments/commission/initialize", { method: "POST", body: JSON.stringify({ requestId }) }, token);
      setPendingCommissionReference(initialized.reference);
      await Linking.openURL(initialized.authorizationUrl);
    });
  }
  async function cancelJob() {
    if (!token || !job) return;
    await act(async () => {
      await request(
        `/provider/jobs/${job.id}/cancel`,
        {
          method: "POST",
          body: JSON.stringify({
            reason: "Provider unable to continue safely",
          }),
        },
        token,
      );
      setJob(null);
    });
  }
  async function rateCustomer(requestId: string, rating: number) {
    if (!token) return;
    await act(async () => {
      await request(`/provider/jobs/${requestId}/rating`, { method: "POST", body: JSON.stringify({ rating }) }, token);
      setProviderJobs(await request<ProviderJobHistory[]>("/provider/jobs", {}, token));
    });
  }

  async function signOut() {
    await clearSession();
    setToken(undefined);
    setRole(undefined);
    setProfile(undefined);
    setMode("CUSTOMER");
    setStep("phone");
    setError("");
  }

  if (token && mode === "CUSTOMER") {
    return <CustomerExperience accessToken={token} apiRequest={request} notice={error} onSignOut={() => void signOut()} onSessionExpired={() => void signOut()} onProviderMode={role === Role.PROVIDER ? () => { setError(""); setMode("PROVIDER"); void load(token); } : undefined} />;
  }

  if (token && mode === "PROVIDER" && step === "status" && profile?.onboardingStatus === OnboardingStatus.APPROVED && !showProviderAccount) {
    return (
      <ProviderCommandCenter
        point={providerPoint}
        token={token}
        availability={profile.availability ?? "OFFLINE"}
        trackingState={trackingState}
        commissionPolicy={wallet ? { dueKobo: wallet.cashCommissionDueKobo, limitKobo: wallet.cashCommissionLimitKobo, remainingKobo: wallet.cashCommissionRemainingKobo, blocked: wallet.commissionBlocked } : undefined}
        offers={offers}
        job={job}
        busy={busy}
        error={error}
        onGoOnline={() => void goOnline()}
        onRespond={(id, accept) => void respondToOffer(id, accept)}
        onProgress={(status) => void progressJob(status)}
        pickupPin={pickupPin}
        onPickupPinChange={setPickupPin}
        onCollectCash={() => void collectCash()}
        onCancelJob={() => void cancelJob()}
        onLocationSettings={() => void Linking.openSettings()}
        onCustomerMode={() => setMode("CUSTOMER")}
        onAccount={() => setShowProviderAccount(true)}
      />
    );
  }

  const sequence: Step[] = ["profile", "services", "documents", "review"];
  const position = sequence.indexOf(step) + 1;
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  const todaysCredits = wallet?.entries.filter((entry) =>
    entry.amountKobo > 0 && new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(entry.createdAt)) === todayKey,
  ) ?? [];
  const todayEarningsKobo = todaysCredits.reduce((total, entry) => total + entry.amountKobo, 0);
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.safe} edges={["top", "right", "bottom", "left"]}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <Image source={require("./assets/roadaid-mark.png")} style={s.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
        <View>
          <Text style={s.brand}>RoadAid</Text>
          <Text style={s.tagline}>BUILT FOR CERTAINTY</Text>
        </View>
      </View>
      <KeyboardAvoidingView style={s.content} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={s.page}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          contentInsetAdjustmentBehavior="automatic"
        >
        {token && role === Role.PROVIDER ? (
          <><Link label="Switch to Customer mode" onPress={() => setMode("CUSTOMER")} />{showProviderAccount ? <Link label="Back to job center" onPress={() => setShowProviderAccount(false)} /> : null}<Link label="Sign out" onPress={() => void signOut()} /></>
        ) : null}
        {position > 0 && (
          <View style={s.progress}>
            <View style={s.progressHeading}><Text style={s.progressTitle}>Provider verification</Text><Text style={s.progressCount}>{position} / 4</Text></View>
            <View style={s.progressSegments}>{sequence.map((item, index) => <View key={item} style={[s.progressSegment, index < position && s.progressSegmentActive]} />)}</View>
          </View>
        )}
        {error ? (
          <Notice title="We could not continue" body={error} warning />
        ) : null}
        {step === "phone" && (
          <Screen
            title="How will you use RoadAid?"
            intro="Choose Customer for roadside help, or Provider to join Abuja’s verified response network."
          >
            <Choice
              label="Customer"
              detail="Request fuel, towing, or lockout assistance"
              selected={intent === "CUSTOMER"}
              onPress={() => setIntent("CUSTOMER")}
            />
            <Choice
              label="Provider"
              detail="Register or sign in to respond to roadside requests"
              selected={intent === "PROVIDER"}
              onPress={() => setIntent("PROVIDER")}
            />
            <Field
              label="Mobile number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Button label="Send secure code" onPress={sendOtp} busy={busy} />
            <Text style={s.legal}>
              Provider registration is available only when creating a new account.
              Existing providers can use both modes.
            </Text>
          </Screen>
        )}
        {step === "otp" && (
          <Screen
            title="Check your phone"
            intro={`Enter the six-digit code sent to ${phone}.`}
          >
            <Field
              label="Verification code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
            />
            <Button
              label="Verify and continue"
              onPress={verify}
              busy={busy}
              disabled={code.length !== 6}
            />
            <Link
              label="Use a different number"
              onPress={() => setStep("phone")}
            />
          </Screen>
        )}
        {step === "profile" && (
          <Screen
            title="Tell us about your response vehicle"
            intro="Operations uses these details to verify your application and match suitable jobs."
          >
            {profile?.rejectionReason ? (
              <Notice
                title="Changes requested"
                body={profile.rejectionReason}
                warning
              />
            ) : null}
            <Field
              label="Business name (optional)"
              value={form.businessName}
              onChangeText={(businessName) =>
                setForm({ ...form, businessName })
              }
            />
            <Field
              label="Operating address"
              value={form.address}
              onChangeText={(address) => setForm({ ...form, address })}
            />
            <View style={s.row}>
              <View style={s.flex}>
                <Field
                  label="Vehicle make"
                  value={form.vehicleMake}
                  onChangeText={(vehicleMake) =>
                    setForm({ ...form, vehicleMake })
                  }
                />
              </View>
              <View style={s.flex}>
                <Field
                  label="Model"
                  value={form.vehicleModel}
                  onChangeText={(vehicleModel) =>
                    setForm({ ...form, vehicleModel })
                  }
                />
              </View>
            </View>
            <Field
              label="Plate number"
              value={form.vehiclePlate}
              onChangeText={(vehiclePlate) =>
                setForm({ ...form, vehiclePlate: vehiclePlate.toUpperCase() })
              }
              autoCapitalize="characters"
            />
            <Button
              label="Save and choose services"
              onPress={saveProfile}
              busy={busy}
              disabled={
                !form.address || !form.vehicleMake || !form.vehiclePlate
              }
            />
          </Screen>
        )}
        {step === "services" && (
          <Screen
            title="Choose your service specialty"
            intro="Each provider account operates one verified service so customers always receive the right responder and equipment."
          >
            {Object.values(ServiceType).map((service) => (
              <Choice
                key={service}
                label={service}
                selected={services.includes(service)}
                onPress={() => setServices([service])}
              />
            ))}
            <Button
              label="Save service capabilities"
              onPress={saveServices}
              busy={busy}
              disabled={services.length !== 1}
            />
            <Link
              label="Back to vehicle details"
              onPress={() => setStep("profile")}
            />
          </Screen>
        )}
        {step === "documents" && (
          <Screen
            title="Verify your identity and vehicle"
            intro="Upload clear JPG, PNG, WEBP, or PDF files up to 8 MB."
          >
            <Upload
              label="National ID"
              present={profile?.documents.some(
                (d) => d.docType === "NATIONAL_ID",
              )}
              onPress={() => upload("NATIONAL_ID")}
            />
            <Upload
              label="Driver’s licence"
              present={profile?.documents.some(
                (d) => d.docType === "DRIVERS_LICENCE",
              )}
              onPress={() => upload("DRIVERS_LICENCE")}
            />
            <Upload
              label="Vehicle papers"
              present={profile?.documents.some(
                (d) => d.docType === "VEHICLE_PAPERS",
              )}
              onPress={() => upload("VEHICLE_PAPERS")}
            />
            <Button
              label="Review application"
              onPress={() => setStep("review")}
              disabled={
                !profile?.documents.some((d) =>
                  ["NATIONAL_ID", "DRIVERS_LICENCE"].includes(d.docType),
                )
              }
            />
            <Link
              label="Back to services"
              onPress={() => setStep("services")}
            />
          </Screen>
        )}
        {step === "review" && (
          <Screen
            title="Ready for operations review"
            intro="Confirm your application before submitting."
          >
            <Summary
              label="Response vehicle"
              value={`${form.vehicleMake} ${form.vehicleModel} · ${form.vehiclePlate}`}
            />
            <Summary label="Services" value={services.join(", ")} />
            <Summary
              label="Documents"
              value={`${profile?.documents.length ?? 0} uploaded`}
            />
            <Notice
              title="What happens next"
              body="Operations reviews each document and service separately. You cannot go online until your profile and at least one service are approved."
            />
            <Button label="Submit for review" onPress={submit} busy={busy} />
            <Link
              label="Check documents"
              onPress={() => setStep("documents")}
            />
          </Screen>
        )}
        {step === "status" && (
          <Screen
            title={
              profile?.onboardingStatus === OnboardingStatus.APPROVED
                ? "Ready for roadside jobs"
                : "Application under review"
            }
            intro="Keep notifications enabled. Offers and active jobs refresh automatically."
          >
            <Notice
              title={profile?.onboardingStatus ?? "SUBMITTED"}
              body={onboardingMessage(profile)}
            />
            {profile?.onboardingStatus === OnboardingStatus.APPROVED && (
              <>
                {showProviderAccount ? <>
                  <Text style={s.section}>NOTIFICATIONS</Text>
                  <Link label="Mark all notifications as read" onPress={() => void act(async () => { await request("/notifications/read-all", { method: "POST" }, token); setProviderNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() }))); })} />
                  {providerNotifications.length ? providerNotifications.slice(0, 20).map((item) => <Pressable key={item.id} accessibilityRole="button" onPress={() => void act(async () => { await request(`/notifications/${item.id}/read`, { method: "POST" }, token); setProviderNotifications((items) => items.map((current) => current.id === item.id ? { ...current, readAt: new Date().toISOString() } : current)); })} style={[s.notice, !item.readAt && { borderColor: "#D38A1C" }]}><Text style={s.noticeTitle}>{item.title}{item.readAt ? "" : " · New"}</Text><Text style={s.noticeBody}>{item.body}</Text><Text style={s.muted}>{new Date(item.createdAt).toLocaleString("en-NG")}</Text></Pressable>) : <Notice title="You’re all caught up" body="Offer, payment, and account updates will appear here." />}
                  <Text style={s.section}>JOB HISTORY</Text>
                  {providerJobs.length ? providerJobs.map((item) => <View key={item.id} style={s.notice}><Text style={s.noticeTitle}>{item.serviceType} · {item.code}</Text><Text style={s.noticeBody}>{item.pickupAddress}</Text><Summary label="Customer" value={item.beneficiaryName ?? item.customer?.fullName ?? "RoadAid customer"} /><Summary label="Earning basis" value={money(item.priceKobo)} />{item.status === "COMPLETED" && !item.providerRatingToCustomer ? <><Text style={s.muted}>Rate the customer after this completed handoff.</Text><View style={s.row}>{[1, 2, 3, 4, 5].map((rating) => <Pressable key={rating} accessibilityRole="button" accessibilityLabel={`Rate customer ${rating} stars`} onPress={() => void rateCustomer(item.id, rating)} style={s.providerNavAction}><Text style={s.providerNavText}>{rating}★</Text></Pressable>)}</View></> : item.providerRatingToCustomer ? <Summary label="Your customer rating" value={`${item.providerRatingToCustomer}/5`} /> : null}</View>) : <Notice title="No completed jobs" body="Completed and cancelled jobs will appear here." />}
                </> : null}
                <Notice
                  title={trackingState === "ACTIVE" ? "Live job tracking" : trackingState === "IDLE" ? "Background location ready" : "Background location needs attention"}
                  body={trackingState === "ACTIVE" ? "Your location is updating about every 5 seconds. Failed updates are queued and sent oldest-first when your connection returns." : trackingState === "IDLE" ? "RoadAid checks your position about every 30 seconds while you wait for work." : "Allow location all the time before going online so tracking continues while your phone is locked."}
                  warning={trackingState === "OFF"}
                />
                {trackingState === "OFF" && <Link label="Open location settings" onPress={() => void Linking.openSettings()} />}
                {job ? (
                  <View style={s.notice}>
                    <Text style={s.noticeTitle}>
                      {[job.serviceType, job.code].filter(Boolean).join(" · ") || "Active roadside job"}
                    </Text>
                    <Text style={s.noticeBody}>{job.pickupAddress || "Pickup details are syncing. Refresh status if they do not appear."}</Text>
                    <Text style={s.noticeBody}>
                      Roadside contact:{" "}
                      {job.beneficiaryName ?? job.customer?.fullName ?? job.customer?.phone ?? "RoadAid customer"}
                    </Text>
                    <Summary label="Job status" value={job.status || "SYNCING"} />
                    {job.status === "ASSIGNED" && (
                      <Button
                        label="Start driving"
                        onPress={() => progressJob("EN_ROUTE")}
                        busy={busy}
                      />
                    )}
                    {job.status === "EN_ROUTE" && (
                      <Button
                        label="Mark arrived"
                        onPress={() => progressJob("ARRIVED")}
                        busy={busy}
                      />
                    )}
                    {job.status === "ARRIVED" && (
                      <Button
                        label="Start service"
                        onPress={() => progressJob("IN_PROGRESS")}
                        busy={busy}
                      />
                    )}
                    {job.status === "IN_PROGRESS" && (
                      <Button
                        label="Complete job"
                        onPress={() => progressJob("COMPLETED")}
                        busy={busy}
                      />
                    )}
                    <Link label="Cancel and return job to search" onPress={() => void cancelJob()} />
                  </View>
                ) : (
                  <Button
                    label="Share location and go online"
                    onPress={goOnline}
                    busy={busy}
                  />
                )}
                <Text style={s.section}>LIVE OFFERS</Text>
                {offers.length === 0 ? (
                  <Notice
                    title="No active offer"
                    body="Stay online. A matching request will appear here with a server-controlled expiry time."
                  />
                ) : (
                  offers.map((offer) => (
                    <View key={offer.id} style={s.notice}>
                      <Text style={s.noticeTitle}>
                        {offer.request.serviceType} · {offer.request.code}
                      </Text>
                      <Text style={s.noticeBody}>
                        {offer.request.pickupAddress}
                        {offer.etaSecondsAtOffer
                          ? ` · about ${Math.ceil(offer.etaSecondsAtOffer / 60)} min away`
                          : ""}
                      </Text>
                      <Text style={s.noticeBody}>
                        Expires {new Date(offer.expiresAt).toLocaleTimeString()}
                      </Text>
                      <View style={s.row}>
                        <View style={s.flex}>
                          <Button
                            label="Decline"
                            onPress={() => respondToOffer(offer.id, false)}
                            busy={busy}
                          />
                        </View>
                        <View style={s.flex}>
                          <Button
                            label="Accept job"
                            onPress={() => respondToOffer(offer.id, true)}
                            busy={busy}
                          />
                        </View>
                      </View>
                    </View>
                  ))
                )}
                <Text style={s.section}>EARNINGS & PAYOUTS</Text>
                <Summary label="Available balance" value={money(wallet?.balanceKobo ?? 0)} />
                <Summary label="Cash commission due" value={money(wallet?.cashCommissionDueKobo ?? 0)} />
                <Summary label="Commission limit" value={money(wallet?.cashCommissionLimitKobo ?? 0)} />
                {wallet?.commissionBlocked ? <Notice title="Repayment required" body="You have reached your cash commission limit and cannot go online or receive offers until you repay enough commission." warning /> : wallet?.cashCommissionDueKobo ? <Notice title={`${money(wallet.cashCommissionRemainingKobo)} allowance remaining`} body="Repay cash commission before reaching the limit to keep receiving offers." /> : null}
                <Summary label="Today’s completed payments" value={String(todaysCredits.length)} />
                <Summary label="Today’s earnings" value={money(todayEarningsKobo)} />
                {pendingCommissionReference ? <Notice title="Confirming commission payment" body="We are verifying your Paystack payment. Do not submit it again." /> : null}
                {wallet?.cashCommissions.map((commission) => <SecondaryButton key={commission.requestId} label={`Pay ${money(commission.amountKobo)} for ${commission.code}`} onPress={() => void settleCommission(commission.requestId)} disabled={busy || Boolean(pendingCommissionReference)} />)}
                {wallet?.entries.length ? wallet.entries.slice(0, 5).map((entry) => <Summary key={entry.id} label={entry.description} value={`${entry.amountKobo < 0 ? "−" : "+"}${money(Math.abs(entry.amountKobo))}`} />) : <Notice title="No earnings yet" body="Completed paid jobs will appear here automatically." />}
                <Field label="Bank name" value={bank.bankName} onChangeText={(bankName) => setBank({ ...bank, bankName })} maxLength={100} />
                <Field label="10-digit account number" value={bank.accountNumber} onChangeText={(accountNumber) => setBank({ ...bank, accountNumber: accountNumber.replace(/\D/g, "").slice(0, 10) })} keyboardType="number-pad" />
                <Field label="Account name" value={bank.accountName} onChangeText={(accountName) => setBank({ ...bank, accountName })} maxLength={255} />
                <Button label="Save bank account" onPress={() => void saveBank()} busy={busy} disabled={!bank.bankName.trim() || bank.accountNumber.length !== 10 || !bank.accountName.trim()} />
                <Field label="Payout amount (whole naira)" value={payoutNaira} onChangeText={(value) => setPayoutNaira(value.replace(/\D/g, ""))} keyboardType="number-pad" />
                <Button label="Request payout" onPress={() => void requestPayout()} busy={busy} disabled={!payoutNaira || Boolean(payouts.find((payout) => payout.status === "REQUESTED"))} />
                {payouts.length ? payouts.slice(0, 5).map((payout) => <Summary key={payout.id} label={`${new Date(payout.requestedAt).toLocaleDateString("en-NG")} · ${payout.status}`} value={money(payout.amountKobo)} />) : <Text style={s.muted}>No payout requests yet.</Text>}
              </>
            )}
            <Text style={s.section}>SERVICES</Text>
            {profile?.services.map((item) => (
              <Summary
                key={item.id}
                label={item.serviceType}
                value={
                  item.rejectionReason
                    ? `${item.status}: ${item.rejectionReason}`
                    : item.status
                }
              />
            ))}
            <Text style={s.section}>DOCUMENTS</Text>
            {profile?.documents.map((item) => (
              <Summary
                key={item.id}
                label={item.docType.replaceAll("_", " ")}
                value={item.note ? `${item.status}: ${item.note}` : item.status}
              />
            ))}
            <Link label="Refresh status" onPress={() => token && load(token)} />
          </Screen>
        )}
        </ScrollView>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function ProviderCommandCenter({ point, token, availability, trackingState, commissionPolicy, offers, job, busy, error, pickupPin, onPickupPinChange, onGoOnline, onRespond, onProgress, onCollectCash, onCancelJob, onLocationSettings, onCustomerMode, onAccount }: {
  point?: MapPoint;
  token: string;
  availability: string;
  trackingState: "OFF" | "IDLE" | "ACTIVE";
  commissionPolicy?: { dueKobo: number; limitKobo: number; remainingKobo: number; blocked: boolean };
  offers: Offer[];
  job: Job | null;
  busy: boolean;
  error: string;
  pickupPin: string;
  onPickupPinChange: (value: string) => void;
  onGoOnline: () => void;
  onRespond: (id: string, accept: boolean) => void;
  onProgress: (status: "EN_ROUTE" | "ARRIVED" | "IN_PROGRESS" | "COMPLETED") => void;
  onCollectCash: () => void;
  onCancelJob: () => void;
  onLocationSettings: () => void;
  onCustomerMode: () => void;
  onAccount: () => void;
}) {
  const [, setTick] = useState(0);
  const mapRef = useRef<MapView>(null);
  const [route, setRoute] = useState<Array<{ latitude: number; longitude: number }>>([]);
  useEffect(() => {
    if (!offers.length) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [offers.length]);
  const center = point ?? { latitude: 9.0765, longitude: 7.3986 };
  const offer = offers[0];
  const secondsLeft = offer ? Math.max(0, Math.ceil(((offer.localDeadlineMs ?? Date.now()) - Date.now()) / 1000)) : 0;
  const nextAction = job?.status === "ASSIGNED" ? ["Start driving", "EN_ROUTE"] as const : job?.status === "EN_ROUTE" ? ["Mark arrived", "ARRIVED"] as const : job?.status === "ARRIVED" ? ["Start service", "IN_PROGRESS"] as const : job?.status === "IN_PROGRESS" ? ["Complete job", "COMPLETED"] as const : null;
  const online = ["ONLINE", "RESERVED", "BUSY"].includes(availability);
  const pickup = job && Number.isFinite(job.pickupLat) && Number.isFinite(job.pickupLng)
    ? { latitude: job.pickupLat as number, longitude: job.pickupLng as number }
    : undefined;
  useEffect(() => {
    if (!point || !pickup) { setRoute([]); return; }
    let active = true;
    void request<{ points: Array<{ lat: number; lng: number }> }>("/maps/route", { method: "POST", body: JSON.stringify({ origin: { lat: point.latitude, lng: point.longitude }, destination: { lat: pickup.latitude, lng: pickup.longitude } }) }, token)
      .then((value) => {
        if (!active) return;
        const points = value.points.map((item) => ({ latitude: item.lat, longitude: item.lng }));
        setRoute(points);
        requestAnimationFrame(() => mapRef.current?.fitToCoordinates(points.length > 1 ? points : [point, pickup], { edgePadding: { top: 120, right: 60, bottom: 360, left: 60 }, animated: true }));
      })
      .catch(() => setRoute([point, pickup]));
    return () => { active = false; };
  }, [job?.id, point?.latitude, point?.longitude, pickup?.latitude, pickup?.longitude, token]);
  const locationAgeSeconds = point?.recordedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(point.recordedAt)) / 1000)) : null;
  return (
    <SafeAreaProvider>
      <View style={s.providerMapShell}>
        <StatusBar barStyle="dark-content" />
        <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={{ ...center, latitudeDelta: 0.05, longitudeDelta: 0.05 }} showsUserLocation showsMyLocationButton={false} toolbarEnabled={false}>
          {point ? <Marker coordinate={point} title="Your live position" pinColor="#191D23" /> : null}
          {pickup ? <Marker coordinate={pickup} title="Customer pickup" pinColor="#D38A1C" /> : null}
          {route.length > 1 ? <Polyline coordinates={route} strokeColor="#D38A1C" strokeWidth={5} /> : null}
        </MapView>
        <SafeAreaView style={s.providerMapTop} edges={["top", "right", "left"]} pointerEvents="box-none">
          <View style={s.providerTopBar}>
            <View style={s.providerStatusBlock}><Text style={s.providerStatusLabel}>{job ? "ACTIVE JOB" : online ? "ONLINE" : "OFFLINE"}</Text><Text style={s.providerStatusTitle}>{job ? job.code || "RoadAid job" : online ? "Ready for offers" : "You are not receiving offers"}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Provider account" onPress={onAccount} style={s.providerRoundAction}><UserRound color="#191D23" size={22} /></Pressable>
          </View>
        </SafeAreaView>
        <SafeAreaView style={s.providerBottomSafe} edges={["bottom"]} pointerEvents="box-none">
          <View style={s.providerSheet}>
            <View style={s.providerSheetHandle} />
            <ScrollView style={s.providerSheetScroller} contentContainerStyle={s.providerSheetContent} showsVerticalScrollIndicator={false}>
            {error ? <Notice title="Action failed" body={error} warning /> : null}
            {job ? <>
              <View style={s.providerJobHeading}><View style={s.providerJobIcon}><Navigation color="#191D23" size={25} /></View><View style={s.providerJobCopy}><Text style={s.providerSheetTitle}>{job.serviceType || "Roadside assistance"}</Text><Text style={s.providerSheetIntro}>{job.pickupAddress || "Pickup details are syncing"}</Text></View></View>
              <Summary label="Roadside contact" value={job.beneficiaryName ?? job.customer?.fullName ?? job.customer?.phone ?? "RoadAid customer"} />
              {job.beneficiaryPhone ? <Summary label="Contact phone" value={job.beneficiaryPhone} /> : null}
              <Summary label="Status" value={(job.status || "SYNCING").replaceAll("_", " ")} />
              <Summary label="Payment" value={job.paymentMode === "CASH" ? `Collect ${money(job.priceKobo ?? 0)} cash` : job.paymentStatus === "PAID" ? "Paid in RoadAid" : "Awaiting in-app payment"} />
              {pickup ? <SecondaryButton label="Navigate to pickup" onPress={() => openNavigation(job)} /> : null}
              {job.status === "EN_ROUTE" ? <Field label="Customer pickup PIN" value={pickupPin} onChangeText={(value) => onPickupPinChange(value.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" maxLength={4} placeholder="4 digits" /> : null}
              {job.paymentMode === "CASH" && job.status === "ARRIVED" && job.paymentStatus !== "PAID" ? <Button label={`Confirm ${money(job.priceKobo ?? 0)} cash received`} onPress={onCollectCash} busy={busy} /> : null}
              {nextAction && !(nextAction[1] === "IN_PROGRESS" && job.paymentStatus !== "PAID") ? <Button label={nextAction[0]} onPress={() => onProgress(nextAction[1])} busy={busy} /> : null}
              <Link label="Cancel and return job to search" onPress={onCancelJob} />
            </> : offer ? <>
              <View style={s.offerHeading}><View><Text style={s.providerSheetTitle}>{offer.request.serviceType} request</Text><Text style={s.providerSheetIntro}>{offer.request.pickupAddress}</Text></View><View style={s.offerTimer}><Clock3 color="#191D23" size={18} /><Text style={s.offerTimerText}>{secondsLeft}s</Text></View></View>
              <Summary label="Estimated arrival" value={offer.etaSecondsAtOffer ? `${Math.max(1, Math.ceil(offer.etaSecondsAtOffer / 60))} min` : "Calculating"} />
              <Summary label="Customer price" value={money(offer.request.priceKobo)} />
              <Summary label="RoadAid commission" value={money(offer.request.commissionKobo)} />
              <Summary label="You receive" value={money(offer.request.providerNetKobo)} />
              <Summary label="Payment" value={offer.request.paymentMode === "CASH" ? "Cash from customer" : "Paid securely in RoadAid"} />
              {offer.request.distanceKm ? <Summary label="Service distance" value={`${offer.request.distanceKm.toFixed(1)} km`} /> : null}
              <View style={s.offerActions}><View style={s.providerFlex}><SecondaryButton label="Decline" onPress={() => onRespond(offer.id, false)} disabled={busy} /></View><View style={s.providerFlex}><Button label="Accept job" onPress={() => onRespond(offer.id, true)} busy={busy} /></View></View>
            </> : <>
              <View style={s.providerIdleIcon}><Power color={online ? "#218A52" : "#83520F"} size={28} /></View>
              <Text style={s.providerSheetTitle}>{online ? "You’re ready for roadside jobs" : "Go online when you’re ready"}</Text>
              <Text style={s.providerSheetIntro}>{online ? "RoadAid is matching nearby requests to your approved services." : "Share your location to receive one timed offer at a time."}</Text>
              {commissionPolicy?.blocked ? <Notice title="Commission repayment required" body={`You owe ${money(commissionPolicy.dueKobo)} and have reached the ${money(commissionPolicy.limitKobo)} limit. Repay from Account & earnings to go online.`} warning /> : commissionPolicy && commissionPolicy.dueKobo > 0 ? <Text style={s.providerSheetIntro}>Cash commission due: {money(commissionPolicy.dueKobo)} · allowance remaining: {money(commissionPolicy.remainingKobo)}</Text> : null}
              {point ? <Text accessibilityLiveRegion="polite" style={s.providerSheetIntro}>GPS {point.accuracy == null ? "accuracy unavailable" : `±${Math.round(point.accuracy)} m`} · {locationAgeSeconds == null ? "freshness unavailable" : locationAgeSeconds < 15 ? "updated just now" : `updated ${locationAgeSeconds}s ago`}</Text> : null}
              {trackingState === "OFF" && online ? <SecondaryButton label="Fix background location" onPress={onLocationSettings} /> : !online && !commissionPolicy?.blocked ? <Button label="Share location and go online" onPress={onGoOnline} busy={busy} /> : null}
            </>}
            <View style={s.providerSheetNav}><Pressable accessibilityRole="button" accessibilityLabel="Switch to Customer mode" onPress={onCustomerMode} style={s.providerNavAction}><Crosshair color="#191D23" size={20} /><Text style={s.providerNavText}>Customer mode</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Open account and earnings" onPress={onAccount} style={s.providerNavAction}><UserRound color="#191D23" size={20} /><Text style={s.providerNavText}>Account & earnings</Text></Pressable></View>
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
}

function SecondaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[s.secondaryButton, disabled && s.disabled]}><Text style={s.secondaryButtonText}>{label}</Text></Pressable>;
}

const money = (kobo: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Math.trunc(kobo / 100));

function Screen({
  title,
  intro,
  children,
}: React.PropsWithChildren<{ title: string; intro: string }>) {
  return (
    <View style={s.screen}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.intro}>{intro}</Text>
      <View style={s.form}>{children}</View>
    </View>
  );
}
function Field({
  label,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput {...props} accessibilityLabel={props.accessibilityLabel ?? label} style={s.input} placeholderTextColor="#718096" />
    </View>
  );
}
function Button({
  label,
  onPress,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(busy || disabled), busy: Boolean(busy) }}
      onPress={onPress}
      disabled={busy || disabled}
      style={[s.button, (busy || disabled) && s.disabled]}
    >
      {busy ? (
        <ActivityIndicator color="#191D23" />
      ) : (
        <Text style={s.buttonText}>{label}</Text>
      )}
    </Pressable>
  );
}
function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.link}>
      <Text style={s.linkText}>{label}</Text>
    </Pressable>
  );
}
function Choice({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: selected }} onPress={onPress} style={[s.choice, selected && s.selected]}>
      <View style={[s.choiceIcon, selected && s.choiceIconSelected]}>{Object.values(ServiceType).includes(label as ServiceType) ? <ServiceIcon service={label as ServiceType} size={25} /> : label === "Customer" ? <UserRound color="#191D23" size={24} /> : <ShieldCheck color="#191D23" size={24} />}</View>
      <View style={s.choiceCopy}>
        <Text style={s.choiceTitle}>
          {label[0] + label.slice(1).toLowerCase()}
        </Text>
        <Text style={s.muted}>{detail ?? "Apply for separate Operations approval"}</Text>
      </View>
      <View style={[s.box, selected && s.checked]}>{selected ? <Check color="#FFFFFF" size={16} strokeWidth={3} /> : <ChevronRight color="#8993A4" size={18} />}</View>
    </Pressable>
  );
}
function Upload({
  label,
  present,
  onPress,
}: {
  label: string;
  present?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={s.upload}>
      <View style={[s.uploadIcon, present && s.uploadIconReady]}>{present ? <FileCheck2 color="#218A52" size={23} /> : <UploadCloud color="#83520F" size={23} />}</View>
      <View style={s.flex}>
        <Text style={s.choiceTitle}>{label}</Text>
        <Text style={s.muted}>
          {present ? "Uploaded and ready for review" : "JPG, PNG, WEBP, or PDF"}
        </Text>
      </View>
      <Pressable onPress={onPress} style={s.outline}>
        <Text style={s.outlineText}>{present ? "Replace" : "Upload"}</Text>
      </Pressable>
    </View>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.summary}>
      <Text style={s.muted}>{label}</Text>
      <Text style={s.summaryValue}>{value}</Text>
    </View>
  );
}
function Notice({
  title,
  body,
  warning,
}: {
  title: string;
  body: string;
  warning?: boolean;
}) {
  return (
    <View style={[s.notice, warning && s.warning]}>
      <Text style={s.noticeTitle}>{title}</Text>
      <Text style={s.noticeBody}>{body}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  providerMapShell: { flex: 1, backgroundColor: "#E9ECE8" },
  providerMapTop: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16 },
  providerTopBar: { minHeight: 66, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  providerStatusBlock: { flex: 1, minHeight: 54, justifyContent: "center", paddingHorizontal: 15, backgroundColor: "#191D23", borderRadius: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 6 },
  providerStatusLabel: { color: "#F4AE3E", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  providerStatusTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "900", marginTop: 2 },
  providerRoundAction: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 10, elevation: 5 },
  providerBottomSafe: { position: "absolute", left: 0, right: 0, bottom: 0 },
  providerSheet: { maxHeight: "72%", backgroundColor: "#F9FAF8", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.14, shadowRadius: 18, elevation: 16 },
  providerSheetScroller: { flexGrow: 0 },
  providerSheetContent: { paddingBottom: 4 },
  providerSheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: "#C8CCC6", alignSelf: "center", marginBottom: 15 },
  providerSheetTitle: { color: "#191D23", fontSize: 24, lineHeight: 29, fontWeight: "900", letterSpacing: -0.45 },
  providerSheetIntro: { color: "#59636F", fontSize: 14, lineHeight: 20, marginTop: 5 },
  providerIdleIcon: { width: 52, height: 52, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF0CC", marginBottom: 12 },
  providerJobHeading: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 6 },
  providerJobIcon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#F4AE3E" },
  providerJobCopy: { flex: 1, minWidth: 0 },
  offerHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 6 },
  offerEyebrow: { color: "#83520F", fontSize: 10, fontWeight: "900", letterSpacing: 0.8, marginBottom: 5 },
  offerTimer: { minWidth: 62, minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 14, backgroundColor: "#FFF0CC" },
  offerTimerText: { color: "#191D23", fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
  offerActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 9 },
  providerFlex: { flex: 1 },
  secondaryButton: { minHeight: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#E8EBE6", marginTop: 4 },
  secondaryButtonText: { color: "#191D23", fontSize: 15, fontWeight: "900" },
  providerSheetNav: { flexDirection: "row", gap: 10, marginTop: 14 },
  providerNavAction: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, backgroundColor: "#ECEFEA" },
  providerNavText: { color: "#191D23", fontSize: 12, fontWeight: "800" },
  safe: { flex: 1, backgroundColor: "#191D23" },
  content: { flex: 1 },
  header: {
    height: 72,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#363B44",
  },
  logo: {
    width: 44,
    height: 44,
  },
  brand: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  tagline: {
    color: "#F4AE3E",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  page: { flexGrow: 1, backgroundColor: "#F6F7F5", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 56 },
  screen: {
    flex: 1,
    justifyContent: "flex-start",
    maxWidth: 620,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    color: "#191D23",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  intro: { color: "#566277", fontSize: 16, lineHeight: 23, marginTop: 10 },
  form: { marginTop: 24, gap: 14 },
  progress: {
    maxWidth: 620,
    width: "100%",
    alignSelf: "center",
    marginBottom: 22,
    padding: 15,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
  progressHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressTitle: { color: "#191D23", fontSize: 13, fontWeight: "900" },
  progressCount: { color: "#70460D", fontSize: 12, fontWeight: "900", fontVariant: ["tabular-nums"] },
  progressSegments: { flexDirection: "row", gap: 6, marginTop: 11 },
  progressSegment: { flex: 1, height: 5, borderRadius: 3, backgroundColor: "#E2E5E0" },
  progressSegmentActive: { backgroundColor: "#D38A1C" },
  field: { gap: 7 },
  label: { color: "#263247", fontSize: 13, fontWeight: "800" },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#C8C1B4",
    borderRadius: 14,
    paddingHorizontal: 15,
    color: "#191D23",
    backgroundColor: "#FFFFFF",
    fontSize: 16,
  },
  row: { flexDirection: "row", gap: 12 },
  flex: { flex: 1 },
  button: {
    minHeight: 54,
    backgroundColor: "#F4AE3E",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  disabled: { opacity: 0.45 },
  buttonText: { color: "#191D23", fontWeight: "900", fontSize: 15 },
  link: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  linkText: { color: "#83520F", fontWeight: "800" },
  legal: {
    color: "#687386",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  choice: {
    flexDirection: "row",
    gap: 13,
    alignItems: "center",
    padding: 13,
    borderWidth: 1,
    borderColor: "#C8C1B4",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  selected: { borderColor: "#D38A1C", backgroundColor: "#FFF0CC" },
  choiceIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#F0F2EE" },
  choiceIconSelected: { backgroundColor: "#F4AE3E" },
  choiceCopy: { flex: 1, minWidth: 0 },
  box: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: "#8993A4",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  checked: { backgroundColor: "#D38A1C", borderColor: "#D38A1C" },
  choiceTitle: { color: "#191D23", fontWeight: "900", fontSize: 15 },
  muted: { color: "#6B7280", fontSize: 12, lineHeight: 18 },
  upload: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: "#D8D2C5",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  uploadIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF0CC" },
  uploadIconReady: { backgroundColor: "#E3F1E8" },
  outline: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#825018",
    borderRadius: 12,
    justifyContent: "center",
  },
  outlineText: { color: "#83520F", fontWeight: "900" },
  summary: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#D8D2C5",
  },
  summaryValue: {
    color: "#191D23",
    fontWeight: "900",
    flex: 1,
    textAlign: "right",
  },
  notice: { backgroundColor: "#E5EDF3", borderRadius: 14, padding: 15 },
  warning: { backgroundColor: "#FFEBC1" },
  noticeTitle: { color: "#191D23", fontWeight: "900" },
  noticeBody: { color: "#4F5C70", marginTop: 5, lineHeight: 19 },
  section: {
    color: "#677286",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginTop: 10,
  },
});
