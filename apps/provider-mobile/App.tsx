import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  Linking,
} from "react-native";
import { fetch as expoFetch } from "expo/fetch";
import { File } from "expo-file-system";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { OnboardingStatus, ServiceType } from "@roadaid/shared";
import { io } from "socket.io-client";

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
type Wallet = { balanceKobo: number; entries: Array<{ id: string; type: string; amountKobo: number; description: string; createdAt: string }> };
type Payout = { id: string; amountKobo: number; status: string; requestedAt: string; paidReference?: string | null };
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
type Offer = {
  id: string;
  expiresAt: string;
  etaSecondsAtOffer?: number;
  request: {
    code: string;
    serviceType: string;
    pickupAddress: string;
    priceKobo: number;
    details: unknown;
  };
};
type Job = {
  id: string;
  code: string;
  serviceType: string;
  status: string;
  pickupAddress: string;
  customer?: { fullName?: string; phone: string };
};

let currentSession: Session | undefined;
let refreshInFlight: Promise<Session> | undefined;

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
        void load(accessToken);
      }
    });
  }, []);
  useEffect(() => {
    if (!token || profile?.onboardingStatus !== OnboardingStatus.APPROVED)
      return;
    const refresh = () =>
      Promise.all([
        request<Offer[]>("/provider/offers", {}, token),
        request<Job | null>("/provider/jobs/current", {}, token),
      ])
        .then(([nextOffers, nextJob]) => {
          setOffers(nextOffers);
          setJob(nextJob);
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
      const active = Boolean(job && ["ASSIGNED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"].includes(job.status));
      if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: active ? Location.Accuracy.High : Location.Accuracy.Balanced,
        timeInterval: active ? 5000 : 30000,
        distanceInterval: active ? 10 : 100,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: active,
        foregroundService: { notificationTitle: "RoadAid: You’re online", notificationBody: active ? "Sharing live location for your active job" : "Ready to receive nearby roadside requests", notificationColor: "#F4B942" },
      });
      setTrackingState(active ? "ACTIVE" : "IDLE");
      await flushLocationBuffer(token);
    };
    void configure().catch(() => setTrackingState("OFF"));
  }, [token, profile?.onboardingStatus, profile?.availability, job?.status]);
  useEffect(() => {
    if (!token || !process.env.EXPO_PUBLIC_EAS_PROJECT_ID) return;
    const register = async () => {
      if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("offers", { name: "RoadAid offers", importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 300, 150, 300], sound: "default" });
      const permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) return;
      const push = await Notifications.getExpoPushTokenAsync({ projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID });
      await request("/devices", { method: "POST", body: JSON.stringify({ platform: Platform.OS === "ios" ? "IOS" : "ANDROID", token: push.data, app: "PROVIDER" }) }, token);
    };
    void register().catch(() => undefined);
  }, [token]);
  useEffect(() => {
    if (!token || profile?.onboardingStatus !== OnboardingStatus.APPROVED) return;
    const socket = io(API.replace(/\/v1$/, ""), { auth: { token }, transports: ["websocket", "polling"] });
    const refresh = () => Promise.all([request<Offer[]>("/provider/offers", {}, token), request<Job | null>("/provider/jobs/current", {}, token)]).then(([nextOffers, nextJob]) => { setOffers(nextOffers); setJob(nextJob); }).catch(() => undefined);
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
      const auth = await request<Session>("/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ phone, code }),
      });
      await saveSession(auth);
      setToken(auth.accessToken);
      await load(auth.accessToken);
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
    const naira = Number(payoutNaira);
    if (!Number.isInteger(naira) || naira <= 0) return setError("Enter a whole-naira payout amount greater than zero.");
    await act(async () => { await request("/provider/payouts", { method: "POST", body: JSON.stringify({ amountKobo: String(naira * 100) }) }, token); setPayouts(await request<Payout[]>("/provider/payouts", {}, token)); setPayoutNaira(""); });
  }
  async function respondToOffer(id: string, accept: boolean) {
    if (!token) return;
    await act(async () => {
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
      setOffers(await request<Offer[]>("/provider/offers", {}, token));
    });
  }
  async function progressJob(status: string) {
    if (!token || !job) return;
    await act(async () => {
      setJob(
        await request<Job>(
          `/provider/jobs/${job.id}/status`,
          { method: "POST", body: JSON.stringify({ status }) },
          token,
        ),
      );
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

  const sequence: Step[] = ["profile", "services", "documents", "review"];
  const position = sequence.indexOf(step) + 1;
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <View style={s.logo}>
          <Text style={s.logoText}>RA</Text>
        </View>
        <View>
          <Text style={s.brand}>RoadAid Partner</Text>
          <Text style={s.tagline}>BUILT FOR CERTAINTY</Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
      >
        {position > 0 && (
          <View style={s.progress}>
            <Text style={s.muted}>Application step {position} of 4</Text>
            <View style={s.track}>
              <View style={[s.fill, { width: `${position * 25}%` }]} />
            </View>
          </View>
        )}
        {error ? (
          <Notice title="We could not continue" body={error} warning />
        ) : null}
        {step === "phone" && (
          <Screen
            title="Start earning with RoadAid"
            intro="Join Abuja’s verified roadside response network."
          >
            <Field
              label="Mobile number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Button label="Send secure code" onPress={sendOtp} busy={busy} />
            <Text style={s.legal}>
              Continuing permits identity and location verification for provider
              operations.
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
            title="What help can you provide?"
            intro="Select only services you have the equipment and experience to complete safely."
          >
            {Object.values(ServiceType).map((service) => (
              <Choice
                key={service}
                label={service}
                selected={services.includes(service)}
                onPress={() =>
                  setServices((current) =>
                    current.includes(service)
                      ? current.filter((item) => item !== service)
                      : [...current, service],
                  )
                }
              />
            ))}
            <Button
              label="Save service capabilities"
              onPress={saveServices}
              busy={busy}
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
              body={
                profile?.rejectionReason ??
                "RoadAid Operations is reviewing your application."
              }
            />
            {profile?.onboardingStatus === OnboardingStatus.APPROVED && (
              <>
                <Notice
                  title={trackingState === "ACTIVE" ? "Live job tracking" : trackingState === "IDLE" ? "Background location ready" : "Background location needs attention"}
                  body={trackingState === "ACTIVE" ? "Your location is updating about every 5 seconds. Failed updates are queued and sent oldest-first when your connection returns." : trackingState === "IDLE" ? "RoadAid checks your position about every 30 seconds while you wait for work." : "Allow location all the time before going online so tracking continues while your phone is locked."}
                  warning={trackingState === "OFF"}
                />
                {trackingState === "OFF" && <Link label="Open location settings" onPress={() => void Linking.openSettings()} />}
                {job ? (
                  <View style={s.notice}>
                    <Text style={s.noticeTitle}>
                      {job.serviceType} · {job.code}
                    </Text>
                    <Text style={s.noticeBody}>{job.pickupAddress}</Text>
                    <Text style={s.noticeBody}>
                      Customer:{" "}
                      {job.customer?.fullName ??
                        job.customer?.phone ??
                        "RoadAid customer"}
                    </Text>
                    <Summary label="Job status" value={job.status} />
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
    </SafeAreaView>
  );
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
      <TextInput {...props} style={s.input} placeholderTextColor="#718096" />
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
      onPress={onPress}
      disabled={busy || disabled}
      style={[s.button, (busy || disabled) && s.disabled]}
    >
      {busy ? (
        <ActivityIndicator color="#101827" />
      ) : (
        <Text style={s.buttonText}>{label}</Text>
      )}
    </Pressable>
  );
}
function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.link}>
      <Text style={s.linkText}>{label}</Text>
    </Pressable>
  );
}
function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[s.choice, selected && s.selected]}>
      <View style={[s.box, selected && s.checked]}>
        <Text style={s.tick}>{selected ? "✓" : ""}</Text>
      </View>
      <View>
        <Text style={s.choiceTitle}>
          {label[0] + label.slice(1).toLowerCase()}
        </Text>
        <Text style={s.muted}>Apply for separate Operations approval</Text>
      </View>
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
  safe: { flex: 1, backgroundColor: "#101827" },
  header: {
    height: 76,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#293449",
  },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F4B942",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { color: "#101827", fontWeight: "900" },
  brand: { color: "#F8FAFC", fontSize: 17, fontWeight: "900" },
  tagline: {
    color: "#F4B942",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  page: { flexGrow: 1, backgroundColor: "#F5F1E8", padding: 20 },
  screen: {
    flex: 1,
    justifyContent: "center",
    maxWidth: 620,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    color: "#172033",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  intro: { color: "#566277", fontSize: 16, lineHeight: 23, marginTop: 10 },
  form: { marginTop: 25, gap: 16 },
  progress: {
    maxWidth: 620,
    width: "100%",
    alignSelf: "center",
    marginBottom: 24,
  },
  track: {
    height: 5,
    backgroundColor: "#D8D2C5",
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 8,
  },
  fill: { height: 5, backgroundColor: "#C97821" },
  field: { gap: 7 },
  label: { color: "#263247", fontSize: 13, fontWeight: "800" },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#C8C1B4",
    borderRadius: 14,
    paddingHorizontal: 15,
    color: "#172033",
    backgroundColor: "#FFFCF5",
    fontSize: 16,
  },
  row: { flexDirection: "row", gap: 12 },
  flex: { flex: 1 },
  button: {
    minHeight: 54,
    backgroundColor: "#F4B942",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  disabled: { opacity: 0.45 },
  buttonText: { color: "#101827", fontWeight: "900", fontSize: 15 },
  link: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  linkText: { color: "#754713", fontWeight: "800" },
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
    padding: 16,
    borderWidth: 1,
    borderColor: "#C8C1B4",
    borderRadius: 14,
    backgroundColor: "#FFFCF5",
  },
  selected: { borderColor: "#9D5B13", backgroundColor: "#FFF1CF" },
  box: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: "#8993A4",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  checked: { backgroundColor: "#9D5B13", borderColor: "#9D5B13" },
  tick: { color: "#FFFFFF", fontWeight: "900" },
  choiceTitle: { color: "#172033", fontWeight: "900", fontSize: 15 },
  muted: { color: "#667185", fontSize: 12, lineHeight: 18 },
  upload: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#D8D2C5",
  },
  outline: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#825018",
    borderRadius: 12,
    justifyContent: "center",
  },
  outlineText: { color: "#754713", fontWeight: "900" },
  summary: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#D8D2C5",
  },
  summaryValue: {
    color: "#172033",
    fontWeight: "900",
    flex: 1,
    textAlign: "right",
  },
  notice: { backgroundColor: "#E5EDF3", borderRadius: 14, padding: 15 },
  warning: { backgroundColor: "#FFEBC1" },
  noticeTitle: { color: "#172033", fontWeight: "900" },
  noticeBody: { color: "#4F5C70", marginTop: 5, lineHeight: 19 },
  section: {
    color: "#677286",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginTop: 10,
  },
});
