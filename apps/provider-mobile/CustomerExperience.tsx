import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { FuelType, LockType, ServiceType } from "@roadaid/shared";
import { io } from "socket.io-client";
import MapView, { MapViewHandle, Marker, Polyline } from "./MapView";
import { Bell, Bike, Crosshair, History, LogOut, Phone, Truck, Wrench } from "lucide-react-native";
import LocationPicker from "./LocationPicker";

declare const process: { env: { EXPO_PUBLIC_API_URL?: string } };
const rawApi = (
  process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3000"
).replace(/\/+$/, "");
const API = rawApi.endsWith("/v1") ? rawApi : `${rawApi}/v1`;
type Screen = "home" | "details" | "location" | "quote" | "history" | "notifications" | "support";
type InboxNotification = { id: string; title: string; body: string; readAt?: string | null; createdAt: string; data?: { requestId?: string; type?: string } | null };
type Quote = {
  priceKobo: number;
  breakdown: { baseKobo: number; variableKobo: number };
};
type RoadRequest = {
  id: string;
  code: string;
  serviceType: string;
  status: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  priceKobo: number;
  paymentStatus: string;
  paymentMode: string;
  completedAt?: string | null;
  etaSeconds?: number | null;
  ratingCustomerToProvider?: number | null;
  disputeFlag?: boolean;
  provider?: { fullName?: string; phone: string; avatarUrl?: string | null; providerProfile?: { ratingAvg?: number | string; ratingCount: number; completedJobs: number; vehicleMake?: string | null; vehicleModel?: string | null; vehiclePlate?: string | null; onboardingStatus: string } } | null;
  pickupPin?: string | null;
  shareToken?: string | null;
  beneficiaryName?: string | null;
  beneficiaryPhone?: string | null;
  scheduledFor?: string | null;
  payments?: Array<{
    reference: string;
    gateway: string;
    status: string;
    paidAt?: string | null;
  }>;
  events?: Array<{ type: string; createdAt: string; payload?: Record<string, unknown> }>;
};
type ProviderPosition = {
  requestId: string;
  lat: number;
  lng: number;
  heading?: number;
  receivedAt: string;
};

function confirmSignOut(onSignOut: () => void) {
  Alert.alert("Sign out of RoadAid?", "You’ll need a new secure code to sign in again.", [
    { text: "Cancel", style: "cancel" },
    { text: "Sign out", style: "destructive", onPress: onSignOut },
  ]);
}

export default function CustomerExperience({
  accessToken,
  apiRequest,
  onProviderMode,
  onSignOut,
  onSessionExpired,
  notice,
}: {
  accessToken: string;
  apiRequest: <T>(
    path: string,
    options?: RequestInit,
    token?: string,
  ) => Promise<T>;
  onProviderMode?: () => void;
  onSignOut: () => void;
  onSessionExpired: () => void;
  notice?: string;
}) {
  const request = apiRequest;
  const [screen, setScreen] = useState<Screen>("home");
  const token = accessToken;
  const [service, setService] = useState<ServiceType>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(notice ?? "");
  const [quote, setQuote] = useState<Quote>();
  const [history, setHistory] = useState<RoadRequest[]>([]);
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [pickup, setPickup] = useState({
    lat: 9.0765,
    lng: 7.3986,
    address: "",
    note: "",
  });
  const [fuel, setFuel] = useState({ fuelType: FuelType.PETROL, litres: "5" });
  const [tow, setTow] = useState({
    address: "",
    vehicleCondition: "",
    lat: "9.0765",
    lng: "7.3986",
  });
  const [lockType, setLockType] = useState<LockType>(LockType.KEYS_INSIDE);
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState("5");
  const [feedback, setFeedback] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"ONLINE" | "CASH">("ONLINE");
  const [bookingForOther, setBookingForOther] = useState(false);
  const [beneficiary, setBeneficiary] = useState({ name: "", phone: "+234" });
  const [scheduleChoice, setScheduleChoice] = useState<"NOW" | "IN_1_HOUR" | "TOMORROW">("NOW");
  const [support, setSupport] = useState({ subject: "", message: "" });
  const [locationTarget, setLocationTarget] = useState<"PICKUP" | "DESTINATION">("PICKUP");
  const [pendingPayment, setPendingPayment] = useState<{ requestId: string; reference: string }>();
  const [paymentChecking, setPaymentChecking] = useState(false);
  const [positions, setPositions] = useState<Record<string, ProviderPosition>>(
    {},
  );
  const [, setClock] = useState(0);
  useEffect(() => {
    if (!token) return;
    const refresh = () =>
      request<RoadRequest[]>("/requests", {}, token)
        .then(setHistory)
        .catch(() => undefined);
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [token]);
  useEffect(() => {
    if (!token) return;
    const socket = io(API.replace(/\/v1$/, ""), {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    const refresh = () =>
      request<RoadRequest[]>("/requests", {}, token)
        .then((items) => {
          setHistory(items);
          items.forEach((item) =>
            socket.emit("join:request", { requestId: item.id }),
          );
        })
        .catch(() => undefined);
    socket.on("connect", refresh);
    socket.on("request.updated", refresh);
    socket.on("notification.new", refresh);
    socket.on("provider.location", (position: ProviderPosition) =>
      setPositions((current) => ({
        ...current,
        [position.requestId]: position,
      })),
    );
    socket.on(
      "request.eta",
      ({ requestId, etaSeconds }: { requestId: string; etaSeconds: number }) =>
        setHistory((items) =>
          items.map((item) =>
            item.id === requestId ? { ...item, etaSeconds } : item,
          ),
        ),
    );
    return () => {
      socket.disconnect();
    };
  }, [token]);
  useEffect(() => {
    const timer = setInterval(() => setClock((value) => value + 1), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!pendingPayment) return;
    let active = true;
    const verify = async () => {
      if (AppState.currentState !== "active") return;
      setPaymentChecking(true);
      try {
        const payment = await request<{ status: string }>(`/payments/${encodeURIComponent(pendingPayment.reference)}/status`, {}, token);
        if (payment.status === "PAID" && active) {
          setHistory(await request<RoadRequest[]>("/requests", {}, token));
          setPendingPayment(undefined);
        }
      } catch { /* polling and realtime will retry without starting another charge */ }
      finally { if (active) setPaymentChecking(false); }
    };
    void verify();
    const timer = setInterval(() => void verify(), 2500);
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void verify(); });
    return () => { active = false; clearInterval(timer); subscription.remove(); };
  }, [pendingPayment, token]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unexpected error";
      setError(message);
      if (message.includes("session has expired")) onSessionExpired();
    } finally {
      setBusy(false);
    }
  }
  function details() {
    if (service === ServiceType.FUEL)
      return { fuelType: fuel.fuelType, litres: Number(fuel.litres) };
    if (service === ServiceType.TOWING)
      return {
        destination: {
          lat: Number(tow.lat),
          lng: Number(tow.lng),
          address: tow.address,
        },
        vehicleCondition: tow.vehicleCondition,
      };
    return { lockType, notes };
  }
  async function locate() {
    await act(async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          "Location permission is required. Enable it in phone settings.",
        );
      const point = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const next = { lat: point.coords.latitude, lng: point.coords.longitude };
      const resolved = await request<{ lat: number; lng: number; address: string }>("/maps/reverse", { method: "POST", body: JSON.stringify(next) }, token).catch(() => ({ ...next, address: `${next.lat.toFixed(5)}, ${next.lng.toFixed(5)}` }));
      setPickup((p) => ({ ...p, ...resolved }));
    });
  }
  async function getQuote() {
    if (!service || !pickup.address.trim())
      return setError("Enter a clear pickup address.");
    await act(async () => {
      setQuote(
        await request(
          "/pricing/quote",
          {
            method: "POST",
            body: JSON.stringify({
              serviceType: service,
              pickup: { lat: pickup.lat, lng: pickup.lng },
              details: details(),
            }),
          },
          token,
        ),
      );
      setScreen("quote");
    });
  }
  async function loadHistory() {
    await act(async () => {
      setHistory(await request("/requests", {}, token));
      setScreen("history");
    });
  }
  async function loadNotifications() {
    await act(async () => {
      setNotifications(await request<InboxNotification[]>("/notifications", {}, token));
      setScreen("notifications");
    });
  }
  async function readNotification(item: InboxNotification) {
    await request(`/notifications/${item.id}/read`, { method: "POST" }, token);
    setNotifications((items) => items.map((current) => current.id === item.id ? { ...current, readAt: new Date().toISOString() } : current));
    if (item.data?.requestId) setScreen("home");
  }
  async function create() {
    if (!service) return;
    await act(async () => {
      await request(
        "/requests",
        {
          method: "POST",
          body: JSON.stringify({
            serviceType: service,
            paymentMethod,
            pickup,
            details: details(),
            beneficiary: bookingForOther ? beneficiary : undefined,
            scheduledFor: scheduleChoice === "NOW" ? undefined : new Date(Date.now() + (scheduleChoice === "IN_1_HOUR" ? 60 * 60_000 : 24 * 60 * 60_000)).toISOString(),
          }),
        },
        token,
      );
      setHistory(await request<RoadRequest[]>("/requests", {}, token));
      setScreen("home");
    });
  }
  async function shareRequest(item: RoadRequest) {
    const statusUrl = item.shareToken ? `${API}/public/requests/${item.shareToken}` : undefined;
    await Share.share({
      title: `RoadAid ${item.code}`,
      message: [`Track my RoadAid request ${item.code}.`, `Status: ${item.status.replaceAll("_", " ")}.`, item.pickupAddress, statusUrl].filter(Boolean).join("\n"),
      url: statusUrl,
    });
  }
  async function createSupportCase() {
    await act(async () => {
      await request("/support/cases", { method: "POST", body: JSON.stringify(support) }, token);
      setSupport({ subject: "", message: "" });
      setScreen("home");
      Alert.alert("Support request received", "RoadAid Operations can now review your message.");
    });
  }
  async function cancel(id: string) {
    Alert.alert("Cancel this request?", "RoadAid will stop matching or release the assigned responder.", [
      { text: "Keep request", style: "cancel" },
      { text: "Cancel request", style: "destructive", onPress: () => void act(async () => {
      await request(
        `/requests/${id}/cancel`,
        {
          method: "POST",
          body: JSON.stringify({
            reason: "Customer no longer needs assistance",
          }),
        },
        token,
      );
      setHistory(await request<RoadRequest[]>("/requests", {}, token));
      }) },
    ]);
  }
  async function pay(id: string) {
    await act(async () => {
      const initialized = await request<{ authorizationUrl: string; reference: string }>(
        "/payments/initialize",
        { method: "POST", body: JSON.stringify({ requestId: id }) },
        token,
      );
      setPendingPayment({ requestId: id, reference: initialized.reference });
      await Linking.openURL(initialized.authorizationUrl);
    });
  }
  async function rate(id: string) {
    await act(async () => {
      await request(
        `/requests/${id}/rating`,
        {
          method: "POST",
          body: JSON.stringify({ rating: Number(rating), review: feedback }),
        },
        token,
      );
      setHistory(await request<RoadRequest[]>("/requests", {}, token));
      setFeedback("");
    });
  }
  async function dispute(id: string) {
    if (!feedback.trim())
      return setError("Describe the problem before submitting it.");
    await act(async () => {
      await request(
        `/requests/${id}/dispute`,
        { method: "POST", body: JSON.stringify({ reason: feedback }) },
        token,
      );
      setHistory(await request<RoadRequest[]>("/requests", {}, token));
      setFeedback("");
    });
  }
  const activeRequest = history.find((item) =>
    ["REQUESTED", "SEARCHING", "ASSIGNED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "ESCALATED"].includes(item.status),
  );
  if (screen === "location") {
    const destination = { lat: Number(tow.lat), lng: Number(tow.lng), address: tow.address };
    return <LocationPicker title={locationTarget === "PICKUP" ? "Confirm pickup" : "Confirm towing destination"} initial={locationTarget === "PICKUP" ? pickup : destination} token={token} apiRequest={request} onCancel={() => setScreen("details")} onConfirm={(point) => {
      if (locationTarget === "PICKUP") setPickup((current) => ({ ...current, ...point }));
      else setTow((current) => ({ ...current, address: point.address, lat: String(point.lat), lng: String(point.lng) }));
      setScreen("details");
    }} />;
  }
  if (screen === "home" && activeRequest) {
    const position = positions[activeRequest.id];
    const ageSeconds = position
      ? Math.max(0, Math.floor((Date.now() - Date.parse(position.receivedAt)) / 1000))
      : null;
    const paymentDue = activeRequest.paymentStatus !== "PAID" &&
      activeRequest.paymentMode === "ONLINE_AFTER_ACCEPT" &&
      ["ASSIGNED", "EN_ROUTE", "ARRIVED"].includes(activeRequest.status);
    return (
      <CustomerActiveMap
        request={activeRequest}
        position={position}
        ageSeconds={ageSeconds}
        busy={busy}
        error={error}
        paymentDue={paymentDue}
        paymentChecking={paymentChecking || pendingPayment?.requestId === activeRequest.id}
        token={token}
        apiRequest={request}
        onPay={() => void pay(activeRequest.id)}
        onCancel={() => void cancel(activeRequest.id)}
        onHistory={() => setScreen("history")}
        onSignOut={onSignOut}
        onProviderMode={onProviderMode}
      />
    );
  }
  if (screen === "home") {
    return (
      <CustomerHomeMap
        pickup={pickup}
        busy={busy}
        error={error}
        onLocate={() => void locate()}
        onService={(next) => { setService(next); setScreen("details"); }}
        onHistory={() => void loadHistory()}
        onNotifications={() => void loadNotifications()}
        onSupport={() => setScreen("support")}
        onSignOut={onSignOut}
        onProviderMode={onProviderMode}
      />
    );
  }
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.safe} edges={["top", "right", "bottom", "left"]}>
      <StatusBar barStyle="light-content" />
      <Header onPress={token ? () => setScreen("home") : undefined} />
      <KeyboardAvoidingView style={s.keyboardArea} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        {onProviderMode ? (
          <Link label="Switch to Provider mode" onPress={onProviderMode} />
        ) : null}
        <Link label="Sign out" onPress={onSignOut} />
        {error ? (
          <Notice title="We could not continue" body={error} warning />
        ) : null}
        {screen === "details" && service && (
          <Section
            title={
              service === ServiceType.FUEL
                ? "Fuel delivery details"
                : service === ServiceType.TOWING
                  ? "Towing details"
                  : "Lockout details"
            }
            intro="Tell Operations exactly what the responder should prepare for."
          >
            {service === ServiceType.FUEL && (
              <>
                <Choices
                  values={Object.values(FuelType)}
                  value={fuel.fuelType}
                  onChange={(v) =>
                    setFuel({ ...fuel, fuelType: v as FuelType })
                  }
                />
                <Field
                  label="Litres"
                  value={fuel.litres}
                  onChangeText={(litres) => setFuel({ ...fuel, litres })}
                  keyboardType="number-pad"
                />
              </>
            )}
            {service === ServiceType.TOWING && (
              <>
                <Field
                  label="Destination address"
                  value={tow.address}
                  onChangeText={(address) => setTow({ ...tow, address })}
                  placeholder="Search or choose on map"
                />
                <SecondaryButton label="Choose destination on map" onPress={() => { setLocationTarget("DESTINATION"); setScreen("location"); }} />
                <Field
                  label="Vehicle condition"
                  value={tow.vehicleCondition}
                  onChangeText={(vehicleCondition) =>
                    setTow({ ...tow, vehicleCondition })
                  }
                />
              </>
            )}
            {service === ServiceType.LOCKOUT && (
              <>
                <Choices
                  values={Object.values(LockType)}
                  value={lockType}
                  onChange={(v) => setLockType(v as LockType)}
                />
                <Field
                  label="Notes (optional)"
                  value={notes}
                  onChangeText={setNotes}
                />
              </>
            )}
            <View style={s.rule} />
            <Field
              label="Pickup address"
              value={pickup.address}
              onChangeText={(address) => setPickup({ ...pickup, address })}
              placeholder="Street, landmark, district"
            />
            <SecondaryButton label="Choose pickup on map" onPress={() => { setLocationTarget("PICKUP"); setScreen("location"); }} />
            <Field
              label="Pickup note (optional)"
              value={pickup.note}
              onChangeText={(note) => setPickup({ ...pickup, note })}
            />
            <Text style={s.label}>Who needs help?</Text>
            <Choices values={["MYSELF", "SOMEONE_ELSE"]} value={bookingForOther ? "SOMEONE_ELSE" : "MYSELF"} onChange={(value) => setBookingForOther(value === "SOMEONE_ELSE")} />
            {bookingForOther ? <>
              <Field label="Person’s name" value={beneficiary.name} onChangeText={(name) => setBeneficiary({ ...beneficiary, name })} maxLength={120} />
              <Field label="Person’s Nigerian phone" value={beneficiary.phone} onChangeText={(phone) => setBeneficiary({ ...beneficiary, phone })} keyboardType="phone-pad" maxLength={14} />
              <Text style={s.muted}>The responder will see this contact for the roadside handoff. Your account remains responsible for payment and the request.</Text>
            </> : null}
            <Link
              label="Use my current GPS location"
              onPress={() => void locate()}
            />
            <Button
              label="Calculate exact price"
              busy={busy}
              onPress={() => void getQuote()}
            />
            <Link
              label="Choose another service"
              onPress={() => setScreen("home")}
            />
          </Section>
        )}
        {screen === "notifications" && (
          <Section title="Notifications" intro="Important request, payment, safety, and account updates stay here even after the push alert closes.">
            <Link label="Mark all as read" onPress={() => void act(async () => { await request("/notifications/read-all", { method: "POST" }, token); setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() }))); })} />
            {notifications.length ? notifications.map((item) => (
              <Pressable key={item.id} accessibilityRole="button" onPress={() => void readNotification(item)} style={[s.notice, !item.readAt && { borderColor: "#D38A1C" }]}>
                <Text style={s.noticeTitle}>{item.title}{item.readAt ? "" : " · New"}</Text>
                <Text style={s.noticeBody}>{item.body}</Text>
                <Text style={s.muted}>{new Date(item.createdAt).toLocaleString("en-NG")}</Text>
              </Pressable>
            )) : <Notice title="You’re all caught up" body="New request and payment updates will appear here." />}
          </Section>
        )}
        {screen === "support" && (
          <Section title="Contact RoadAid support" intro="Send Operations the details needed to investigate. For immediate danger, contact local emergency services first.">
            <Field label="Subject" value={support.subject} onChangeText={(subject) => setSupport({ ...support, subject })} maxLength={160} />
            <Field label="What happened?" value={support.message} onChangeText={(message) => setSupport({ ...support, message })} multiline maxLength={3000} />
            <Button label="Send to Operations" busy={busy} disabled={!support.subject.trim() || support.message.trim().length < 10} onPress={() => void createSupportCase()} />
          </Section>
        )}
        {screen === "quote" && quote && service && (
          <Section
            title="Review before requesting"
            intro="This price is calculated by RoadAid and will be locked when you confirm."
          >
            <Summary label="Service" value={service} />
            <Summary label="Pickup" value={pickup.address} />
            {bookingForOther ? <Summary label="Helping" value={`${beneficiary.name} · ${beneficiary.phone}`} /> : null}
            <Summary label="Payment" value={paymentMethod === "CASH" ? "Cash to provider" : "Pay securely in RoadAid"} />
            <Summary label="Base" value={money(quote.breakdown.baseKobo)} />
            <Summary
              label="Service charge"
              value={money(quote.breakdown.variableKobo)}
            />
            <View style={s.total}>
              <Text style={s.totalLabel}>Total</Text>
              <Text style={s.totalValue}>{money(quote.priceKobo)}</Text>
            </View>
            <Text style={s.label}>How would you like to pay?</Text>
            <Choices values={["ONLINE", "CASH"]} value={paymentMethod} onChange={(value) => setPaymentMethod(value as "ONLINE" | "CASH")} />
            <Text style={s.muted}>{paymentMethod === "CASH" ? "Pay the exact total directly to your responder after they arrive. RoadAid will still issue a receipt." : "Pay securely in the app after a responder accepts."}</Text>
            <Text style={s.label}>When do you need help?</Text>
            <Choices values={["NOW", "IN_1_HOUR", "TOMORROW"]} value={scheduleChoice} onChange={(value) => setScheduleChoice(value as typeof scheduleChoice)} />
            {scheduleChoice !== "NOW" ? <Text style={s.muted}>RoadAid will begin matching responders at {new Date(Date.now() + (scheduleChoice === "IN_1_HOUR" ? 60 * 60_000 : 24 * 60 * 60_000)).toLocaleString("en-NG")}.</Text> : null}
            <Button
              label="Request assistance"
              busy={busy}
              onPress={() => void create()}
              disabled={bookingForOther && (beneficiary.name.trim().length < 2 || !/^\+234\d{10}$/.test(beneficiary.phone))}
            />
            <Link label="Change details" onPress={() => setScreen("details")} />
          </Section>
        )}
        {screen === "history" && (
          <Section
            title="Your requests"
            intro="Live status and payment confirmation refresh every five seconds."
          >
            {history.length === 0 ? (
              <Notice
                title="No requests yet"
                body="Your first roadside request will appear here."
              />
            ) : (
              history.map((item) => {
                const position = positions[item.id];
                const age = position
                  ? Math.max(
                      0,
                      Math.floor(
                        (Date.now() - Date.parse(position.receivedAt)) / 1000,
                      ),
                    )
                  : null;
                const paid = item.payments?.find(
                  (payment) => payment.status === "PAID",
                );
                return (
                  <View key={item.id} style={s.history}>
                    <View style={s.between}>
                      <Text style={s.historyCode}>{item.code}</Text>
                      <Text style={s.status}>{item.status}</Text>
                    </View>
                    <Text style={s.historyService}>
                      {item.serviceType} · {money(item.priceKobo)}
                    </Text>
                    <Text style={s.muted}>{item.pickupAddress}</Text>
                    <Text style={s.muted}>Payment: {item.paymentStatus}</Text>
                    {item.scheduledFor ? <Text style={s.muted}>Scheduled: {new Date(item.scheduledFor).toLocaleString("en-NG")}</Text> : null}
                    {item.beneficiaryName ? <Text style={s.muted}>Roadside contact: {item.beneficiaryName} · {item.beneficiaryPhone}</Text> : null}
                    {item.shareToken ? <SecondaryButton label="Share live request status" onPress={() => void shareRequest(item)} /> : null}
                    {item.provider && (
                      <ActiveTracking
                        request={item}
                        position={position}
                        ageSeconds={age}
                      />
                    )}
                    {item.status === "COMPLETED" && (
                      <View style={s.receipt}>
                        <Text style={s.receiptTitle}>RoadAid receipt</Text>
                        <Summary label="Service" value={item.serviceType} />
                        <Summary
                          label="Total paid"
                          value={money(item.priceKobo)}
                        />
                        <Summary
                          label="Payment"
                          value={
                            paid
                              ? `${paid.gateway} · ${paid.reference}`
                              : item.paymentStatus
                          }
                        />
                        <Summary
                          label="Completed"
                          value={
                            item.completedAt
                              ? new Date(item.completedAt).toLocaleString(
                                  "en-NG",
                                  { timeZone: "Africa/Lagos" },
                                )
                              : "Completion recorded"
                          }
                        />
                      </View>
                    )}
                    {item.paymentStatus !== "PAID" &&
                      ((item.paymentMode === "ONLINE_AFTER_ACCEPT" &&
                        ["ASSIGNED", "EN_ROUTE", "ARRIVED"].includes(
                          item.status,
                        )) ||
                        (item.paymentMode === "ONLINE_ON_COMPLETION" &&
                          item.status === "COMPLETED")) && (
                        <Button
                          label={`Pay ${money(item.priceKobo)}`}
                          onPress={() => void pay(item.id)}
                          busy={busy}
                        />
                      )}
                    {[
                      "REQUESTED",
                      "SEARCHING",
                      "ESCALATED",
                      "ASSIGNED",
                      "EN_ROUTE",
                    ].includes(item.status) && (
                      <Link
                        label="Cancel this request"
                        onPress={() => void cancel(item.id)}
                      />
                    )}
                    {item.status === "COMPLETED" &&
                      !item.ratingCustomerToProvider && (
                        <>
                          <Field
                            label="Rating (1–5)"
                            value={rating}
                            onChangeText={setRating}
                            keyboardType="number-pad"
                            maxLength={1}
                          />
                          <Field
                            label="Review or problem details"
                            value={feedback}
                            onChangeText={setFeedback}
                            multiline
                          />
                          <Button
                            label="Rate provider"
                            onPress={() => void rate(item.id)}
                            busy={busy}
                          />
                          {!item.disputeFlag && (
                            <Link
                              label="Report a problem"
                              onPress={() => void dispute(item.id)}
                            />
                          )}
                        </>
                      )}
                  </View>
                );
              })
            )}
            <Link
              label="Request another service"
              onPress={() => setScreen("home")}
            />
          </Section>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function CustomerHomeMap({ pickup, busy, error, onLocate, onService, onHistory, onNotifications, onSupport, onSignOut, onProviderMode }: {
  pickup: { lat: number; lng: number; address: string };
  busy: boolean;
  error: string;
  onLocate: () => void;
  onService: (service: ServiceType) => void;
  onHistory: () => void;
  onNotifications: () => void;
  onSupport: () => void;
  onSignOut: () => void;
  onProviderMode?: () => void;
}) {
  return (
    <SafeAreaProvider>
      <View style={s.mapShell}>
        <StatusBar barStyle="dark-content" />
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={{ latitude: pickup.lat, longitude: pickup.lng, latitudeDelta: 0.045, longitudeDelta: 0.045 }}
          showsUserLocation
          showsMyLocationButton={false}
          toolbarEnabled={false}
        >
          <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} title="Your pickup" pinColor="#D38A1C" />
        </MapView>
        <SafeAreaView style={s.mapChrome} edges={["top", "right", "left"]} pointerEvents="box-none">
          <View style={s.floatingBar}>
            <View style={s.compactBrand}>
              <Image source={require("./assets/roadaid-mark.png")} style={s.compactLogo} resizeMode="contain" />
              <View><Text style={s.compactBrandName}>RoadAid</Text><Text style={s.compactTagline}>BUILT FOR CERTAINTY</Text></View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Open notifications" onPress={onNotifications} style={s.roundAction}><Bell color="#191D23" size={22} /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => confirmSignOut(onSignOut)} style={s.roundAction}><LogOut color="#191D23" size={22} /></Pressable>
            </View>
          </View>
        </SafeAreaView>
        <Pressable accessibilityRole="button" accessibilityLabel="Use my current location" onPress={onLocate} disabled={busy} style={s.locateFab}>
          {busy ? <ActivityIndicator color="#191D23" /> : <Crosshair color="#191D23" size={23} />}
        </Pressable>
        <SafeAreaView style={s.bottomSafe} edges={["bottom"]} pointerEvents="box-none">
          <View style={s.rideSheet}>
            <View style={s.sheetHandle} />
            <ScrollView style={s.sheetScroller} contentContainerStyle={s.sheetScrollContent} showsVerticalScrollIndicator={false}>
            <Text style={s.sheetTitle}>Where do you need help?</Text>
            <Text style={s.sheetIntro}>Choose a roadside service. You’ll see the exact price before confirming.</Text>
            {error ? <Notice title="We could not continue" body={error} warning /> : null}
            <View style={s.serviceGrid}>
              <QuickService service={ServiceType.FUEL} label="Fuel" icon={<Bike color="#191D23" size={25} />} onPress={onService} />
              <QuickService service={ServiceType.TOWING} label="Towing" icon={<Truck color="#191D23" size={25} />} onPress={onService} />
              <QuickService service={ServiceType.LOCKOUT} label="Lockout" icon={<Wrench color="#191D23" size={25} />} onPress={onService} />
            </View>
            <View style={s.sheetActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Open request activity" onPress={onHistory} style={s.secondaryAction}><History color="#191D23" size={20} /><Text style={s.secondaryActionText}>Activity</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Contact support" onPress={onSupport} style={s.secondaryAction}><Phone color="#191D23" size={20} /><Text style={s.secondaryActionText}>Help</Text></Pressable>
              {onProviderMode ? <Pressable accessibilityRole="button" accessibilityLabel="Switch to Provider mode" onPress={onProviderMode} style={s.secondaryAction}><Truck color="#191D23" size={20} /><Text style={s.secondaryActionText}>Provider mode</Text></Pressable> : null}
            </View>
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
}

function QuickService({ service, label, icon, onPress }: { service: ServiceType; label: string; icon: React.ReactNode; onPress: (service: ServiceType) => void }) {
  return <Pressable accessibilityRole="button" onPress={() => onPress(service)} style={s.quickService}><View style={s.quickServiceIcon}>{icon}</View><Text style={s.quickServiceLabel}>{label}</Text></Pressable>;
}

function CustomerActiveMap({ request, position, ageSeconds, busy, error, paymentDue, paymentChecking, token, apiRequest, onPay, onCancel, onHistory, onSignOut, onProviderMode }: {
  request: RoadRequest; position?: ProviderPosition; ageSeconds: number | null; busy: boolean; error: string; paymentDue: boolean; paymentChecking: boolean;
  token: string; apiRequest: <T>(path: string, options?: RequestInit, token?: string) => Promise<T>;
  onPay: () => void; onCancel: () => void; onHistory: () => void; onSignOut: () => void; onProviderMode?: () => void;
}) {
  const mapRef = useRef<MapViewHandle>(null);
  const [route, setRoute] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const presentation = servicePresentation(request.serviceType);
  const pickup = { latitude: request.pickupLat || 9.0765, longitude: request.pickupLng || 7.3986 };
  const provider = position ? { latitude: position.lat, longitude: position.lng } : undefined;
  const center = provider ?? pickup;
  const stale = ageSeconds !== null && ageSeconds > 30;
  const disconnected = ageSeconds !== null && ageSeconds > 120;
  const waitingForSchedule = request.status === "REQUESTED" && request.scheduledFor && Date.parse(request.scheduledFor) > Date.now();
  const headline = waitingForSchedule ? "Your assistance is scheduled" : request.status === "ARRIVED" ? "Your responder has arrived" : request.status === "IN_PROGRESS" ? "Service in progress" : ["ASSIGNED", "EN_ROUTE"].includes(request.status) ? "Your responder is on the way" : request.status === "ESCALATED" ? "Operations is finding another responder" : "Finding the best responder";
  const latestDispatchEvent = [...(request.events ?? [])].reverse().find((event) => ["OFFER_SENT", "OFFER_DECLINED", "OFFER_EXPIRED", "DISPATCH_ESCALATED"].includes(event.type));
  const dispatchMessage = waitingForSchedule ? `Matching begins ${new Date(request.scheduledFor!).toLocaleString("en-NG")}` : request.status === "SEARCHING"
    ? latestDispatchEvent?.type === "OFFER_SENT" ? "A nearby responder is reviewing your request"
      : latestDispatchEvent?.type === "OFFER_DECLINED" || latestDispatchEvent?.type === "OFFER_EXPIRED" ? "That responder was unavailable; trying the next nearby responder"
      : "Checking nearby approved responders"
    : request.status === "ESCALATED" ? "Operations is expanding the search and monitoring your request" : undefined;
  useEffect(() => {
    if (!provider) { setRoute([]); return; }
    let active = true;
    void apiRequest<{ points: Array<{ lat: number; lng: number }> }>("/maps/route", { method: "POST", body: JSON.stringify({ origin: { lat: provider.latitude, lng: provider.longitude }, destination: { lat: pickup.latitude, lng: pickup.longitude } }) }, token)
      .then((value) => {
        if (!active) return;
        const points = value.points.map((item) => ({ latitude: item.lat, longitude: item.lng }));
        setRoute(points);
        requestAnimationFrame(() => mapRef.current?.fitToCoordinates(points.length > 1 ? points : [provider, pickup], { edgePadding: { top: 110, right: 50, bottom: 350, left: 50 }, animated: true }));
      }).catch(() => setRoute([provider, pickup]));
    return () => { active = false; };
  }, [position?.lat, position?.lng, request.id, token]);
  return (
    <SafeAreaProvider>
      <View style={s.mapShell}>
        <StatusBar barStyle="dark-content" />
        <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={{ ...center, latitudeDelta: 0.04, longitudeDelta: 0.04 }} showsCompass={false} toolbarEnabled={false}>
          <Marker coordinate={pickup} title="Pickup" pinColor="#D38A1C" />
          {provider ? <Marker coordinate={provider} title={presentation.role} pinColor="#191D23" /> : null}
          {route.length > 1 ? <Polyline coordinates={route} strokeColor="#D38A1C" strokeWidth={5} /> : null}
        </MapView>
        <SafeAreaView style={s.mapChrome} edges={["top", "right", "left"]} pointerEvents="box-none">
          <View style={s.floatingBar}><View style={s.tripCode}><Text style={s.tripCodeLabel}>{request.serviceType}</Text><Text style={s.tripCodeValue}>{request.code}</Text></View><Pressable accessibilityRole="button" onPress={onHistory} style={s.roundAction}><History color="#191D23" size={22} /></Pressable></View>
        </SafeAreaView>
        <SafeAreaView style={s.bottomSafe} edges={["bottom"]} pointerEvents="box-none">
          <View style={s.rideSheet}>
            <View style={s.sheetHandle} />
            <ScrollView style={s.sheetScroller} contentContainerStyle={s.sheetScrollContent} showsVerticalScrollIndicator={false}>
            <View style={s.activeHeading}><View style={s.activeCopy}><Text style={s.sheetTitle}>{headline}</Text><Text style={s.sheetIntro}>{request.etaSeconds ? `${Math.max(1, Math.ceil(request.etaSeconds / 60))} min estimated arrival` : request.pickupAddress}</Text></View><View style={s.quickServiceIcon}>{presentation.icon}</View></View>
            <View style={[s.liveStrip, (stale || disconnected) && s.liveStripWarning]}><View style={[s.liveDot, (stale || disconnected) && s.liveDotWarning]} /><Text style={s.liveText}>{disconnected ? "Location connection lost" : stale ? "Location update delayed" : provider ? "Responder location is live" : "Waiting for responder location"}</Text></View>
            {dispatchMessage ? <Text accessibilityLiveRegion="polite" style={s.sheetIntro}>{dispatchMessage}</Text> : null}
            {request.provider ? <View style={s.responderCompact}><View><Text style={s.responderName}>{request.provider.fullName ?? "Verified RoadAid responder"}</Text><Text style={s.responderRole}>{presentation.role}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Call responder" onPress={() => void Linking.openURL(`tel:${request.provider?.phone}`)} style={s.callButton}><Phone color="#191D23" size={21} /></Pressable></View> : null}
            {request.provider?.providerProfile ? <><Summary label="Verified jobs" value={String(request.provider.providerProfile.completedJobs)} /><Summary label="Rating" value={`${Number(request.provider.providerProfile.ratingAvg ?? 0).toFixed(1)} (${request.provider.providerProfile.ratingCount})`} />{request.provider.providerProfile.vehiclePlate ? <Summary label="Service vehicle" value={`${request.provider.providerProfile.vehicleMake ?? ""} ${request.provider.providerProfile.vehicleModel ?? ""} · ${request.provider.providerProfile.vehiclePlate}`.trim()} /> : null}</> : null}
            {request.pickupPin && ["ASSIGNED", "EN_ROUTE"].includes(request.status) ? <Notice title={`Pickup PIN: ${request.pickupPin}`} body="Give this PIN only to the verified responder after checking their identity and service vehicle." /> : null}
            {error ? <Notice title="Update failed" body={error} warning /> : null}
            {request.paymentMode === "CASH" && request.paymentStatus !== "PAID" ? <Notice title={`Cash payment: ${money(request.priceKobo)}`} body="Pay the exact total directly to your verified responder after they arrive. Ask them to confirm receipt in RoadAid." /> : null}
            {paymentChecking ? <Notice title="Confirming payment" body="We are checking Paystack. Do not pay again or close RoadAid." /> : null}
            {paymentDue && !paymentChecking ? <Button label={`Pay ${money(request.priceKobo)}`} onPress={onPay} busy={busy} /> : null}
            {["REQUESTED", "SEARCHING", "ESCALATED", "ASSIGNED", "EN_ROUTE"].includes(request.status) ? <Link label="Cancel request" onPress={onCancel} /> : null}
            <View style={s.sheetActions}>{onProviderMode ? <Pressable accessibilityRole="button" accessibilityLabel="Switch to Provider mode" onPress={onProviderMode} style={s.secondaryAction}><Truck color="#191D23" size={20} /><Text style={s.secondaryActionText}>Provider mode</Text></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => confirmSignOut(onSignOut)} style={s.secondaryAction}><LogOut color="#191D23" size={20} /><Text style={s.secondaryActionText}>Sign out</Text></Pressable></View>
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
}
const REQUEST_STEPS = [
  "REQUESTED",
  "SEARCHING",
  "ASSIGNED",
  "EN_ROUTE",
  "ARRIVED",
  "IN_PROGRESS",
  "COMPLETED",
];

function servicePresentation(serviceType: string) {
  if (serviceType === ServiceType.FUEL)
    return {
      role: "Your dispatch rider",
      icon: <Bike color="#191D23" size={28} strokeWidth={2.2} />,
    };
  if (serviceType === ServiceType.TOWING)
    return {
      role: "Your tow operator",
      icon: <Truck color="#191D23" size={28} strokeWidth={2.2} />,
    };
  return {
    role: "Your roadside technician",
    icon: <Wrench color="#191D23" size={28} strokeWidth={2.2} />,
  };
}

function ActiveTracking({
  request,
  position,
  ageSeconds,
}: {
  request: RoadRequest;
  position?: ProviderPosition;
  ageSeconds: number | null;
}) {
  const presentation = servicePresentation(request.serviceType);
  const step = Math.max(0, REQUEST_STEPS.indexOf(request.status));
  const pickup = { latitude: request.pickupLat, longitude: request.pickupLng };
  const provider = position
    ? { latitude: position.lat, longitude: position.lng }
    : undefined;
  const validPickup =
    Number.isFinite(pickup.latitude) &&
    Number.isFinite(pickup.longitude) &&
    pickup.latitude !== 0;
  const center =
    provider ??
    (validPickup ? pickup : { latitude: 9.0765, longitude: 7.3986 });
  const stale = ageSeconds !== null && ageSeconds > 30;
  const disconnected = ageSeconds !== null && ageSeconds > 120;
  const headline =
    request.status === "ARRIVED"
      ? `${presentation.role.replace("Your ", "The ")} has arrived`
      : request.status === "IN_PROGRESS"
        ? "Your roadside service is in progress"
        : request.status === "ASSIGNED" || request.status === "EN_ROUTE"
          ? `${presentation.role.replace("Your ", "The ")} is on the way`
          : "RoadAid is coordinating your request";

  return (
    <View style={s.tracking}>
      <View style={s.trackingHero}>
        <View style={s.trackingCopy}>
          <Text style={s.trackingTitle}>{headline}</Text>
          <Text style={s.trackingEta}>
            {request.etaSeconds
              ? `About ${Math.max(1, Math.ceil(request.etaSeconds / 60))} min away`
              : "We’ll update your arrival time shortly"}
          </Text>
        </View>
        <View
          style={s.serviceIcon}
          accessibilityLabel={`${request.serviceType} responder`}
        >
          {presentation.icon}
        </View>
      </View>
      <View
        style={s.progressSegments}
        accessibilityLabel={`Request progress: ${request.status.replaceAll("_", " ")}`}
      >
        {REQUEST_STEPS.map((status, index) => (
          <View
            key={status}
            style={[
              s.progressSegment,
              index <= step && s.progressSegmentActive,
            ]}
          />
        ))}
      </View>
      <Text style={s.progressLabel}>{request.status.replaceAll("_", " ")}</Text>
      <View style={s.responderRow}>
        <View style={s.responderIdentity}>
          <View style={s.responderAvatar}>{presentation.icon}</View>
          <View style={s.responderText}>
            <Text style={s.responderName} numberOfLines={1}>
              {request.provider?.fullName ?? request.provider?.phone}
            </Text>
            <Text style={s.responderRole}>{presentation.role}</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Call ${presentation.role.replace("Your ", "")}`}
          onPress={() => void Linking.openURL(`tel:${request.provider?.phone}`)}
          style={s.callButton}
        >
          <Phone color="#83520F" size={22} strokeWidth={2.2} />
        </Pressable>
      </View>
      <View style={s.mapFrame}>
        <MapView
          style={s.map}
          region={{ ...center, latitudeDelta: 0.035, longitudeDelta: 0.035 }}
          showsCompass={false}
          showsMyLocationButton={false}
          toolbarEnabled={false}
        >
          {validPickup && (
            <Marker
              coordinate={pickup}
              title="Your pickup"
              pinColor="#F4AE3E"
            />
          )}
          {provider && (
            <Marker
              coordinate={provider}
              title={presentation.role}
              pinColor="#191D23"
            />
          )}
          {validPickup && provider && (
            <Polyline
              coordinates={[provider, pickup]}
              strokeColor="#D38A1C"
              strokeWidth={4}
            />
          )}
        </MapView>
        <View style={[s.locationState, disconnected && s.locationStateWarning]}>
          <Text style={s.locationStateText}>
            {disconnected
              ? `Connection lost · last seen ${new Date(position!.receivedAt).toLocaleTimeString("en-NG")}`
              : stale
                ? `Location delayed · ${Math.ceil((ageSeconds ?? 0) / 60)} min ago`
                : provider
                  ? "Location live"
                  : "Waiting for first location update"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const money = (kobo: number) =>
  `₦${Math.trunc(kobo / 100).toLocaleString("en-NG")}`;
function Header({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={s.header}>
      <Image
        source={require("./assets/roadaid-mark.png")}
        style={s.logo}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <View>
        <Text style={s.brand}>RoadAid</Text>
        <Text style={s.tagline}>BUILT FOR CERTAINTY</Text>
      </View>
    </Pressable>
  );
}
function Section({
  title,
  intro,
  children,
}: React.PropsWithChildren<{ title: string; intro: string }>) {
  return (
    <View style={s.section}>
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
      <TextInput {...props} style={s.input} placeholderTextColor="#778196" />
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
function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={s.secondaryButton}>
      <Text style={s.secondaryButtonText}>{label}</Text>
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
function Choices({
  values,
  value,
  onChange,
}: {
  values: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={s.choices}>
      {values.map((item) => (
        <Pressable
          key={item}
          onPress={() => onChange(item)}
          style={[s.choice, item === value && s.choiceActive]}
        >
          <Text style={[s.choiceText, item === value && s.choiceTextActive]}>
            {item.replaceAll("_", " ")}
          </Text>
        </Pressable>
      ))}
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
  mapShell: { flex: 1, backgroundColor: "#E9ECE8" },
  mapChrome: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16 },
  floatingBar: { minHeight: 60, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  compactBrand: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "#191D23", borderRadius: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 6 },
  compactLogo: { width: 36, height: 36 },
  compactBrandName: { color: "#FFFFFF", fontSize: 16, lineHeight: 18, fontWeight: "900" },
  compactTagline: { color: "#F4AE3E", fontSize: 7, lineHeight: 10, fontWeight: "900", letterSpacing: 1.1 },
  roundAction: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 10, elevation: 5 },
  locateFab: { position: "absolute", right: 18, bottom: 330, width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.17, shadowRadius: 10, elevation: 5 },
  bottomSafe: { position: "absolute", left: 0, right: 0, bottom: 0 },
  rideSheet: { maxHeight: "72%", backgroundColor: "#F9FAF8", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.14, shadowRadius: 18, elevation: 16 },
  keyboardArea: { flex: 1 },
  sheetScroller: { flexGrow: 0 },
  sheetScrollContent: { paddingBottom: 4 },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: "#C8CCC6", alignSelf: "center", marginBottom: 15 },
  sheetTitle: { color: "#191D23", fontSize: 25, lineHeight: 30, fontWeight: "900", letterSpacing: -0.5 },
  sheetIntro: { color: "#59636F", fontSize: 14, lineHeight: 20, marginTop: 5 },
  serviceGrid: { flexDirection: "row", gap: 10, marginTop: 18 },
  quickService: { flex: 1, minHeight: 86, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: "#FFF0CC" },
  quickServiceIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#F4AE3E" },
  quickServiceLabel: { color: "#191D23", fontSize: 13, fontWeight: "900" },
  sheetActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  secondaryAction: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, backgroundColor: "#ECEFEA" },
  secondaryActionText: { color: "#191D23", fontSize: 13, fontWeight: "800" },
  tripCode: { minHeight: 52, justifyContent: "center", paddingHorizontal: 15, backgroundColor: "#191D23", borderRadius: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 6 },
  tripCodeLabel: { color: "#F4AE3E", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  tripCodeValue: { color: "#FFFFFF", fontSize: 15, fontWeight: "900", marginTop: 2 },
  activeHeading: { flexDirection: "row", alignItems: "center", gap: 14 },
  activeCopy: { flex: 1, minWidth: 0 },
  liveStrip: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "#E3F1E8", marginTop: 15 },
  liveStripWarning: { backgroundColor: "#FFF0CC" },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#218A52" },
  liveDotWarning: { backgroundColor: "#C97821" },
  liveText: { color: "#263247", fontSize: 13, fontWeight: "800" },
  responderCompact: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 9 },
  safe: { flex: 1, backgroundColor: "#191D23" },
  header: {
    height: 80,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#363B44",
  },
  logo: { width: 44, height: 44 },
  brand: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  tagline: {
    color: "#F4AE3E",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  page: { flexGrow: 1, backgroundColor: "#F6F7F5", padding: 20 },
  section: {
    flex: 1,
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    justifyContent: "center",
  },
  title: {
    color: "#191D23",
    fontSize: 31,
    lineHeight: 37,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  intro: { color: "#5D6673", fontSize: 16, lineHeight: 23, marginTop: 10 },
  form: { marginTop: 26, gap: 15 },
  field: { gap: 7 },
  label: { color: "#252A32", fontSize: 13, fontWeight: "800" },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#D5D8D3",
    borderRadius: 14,
    paddingHorizontal: 15,
    color: "#191D23",
    backgroundColor: "#FFFFFF",
    fontSize: 16,
  },
  button: {
    minHeight: 54,
    backgroundColor: "#F4AE3E",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.45 },
  buttonText: { color: "#191D23", fontWeight: "900", fontSize: 15 },
  secondaryButton: { minHeight: 50, borderWidth: 1, borderColor: "#B7BDB5", borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", paddingHorizontal: 14 },
  secondaryButtonText: { color: "#252A32", fontWeight: "900", fontSize: 14 },
  link: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  linkText: { color: "#83520F", fontWeight: "800" },
  service: {
    minHeight: 76,
    borderBottomWidth: 1,
    borderBottomColor: "#DDE0DB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  serviceContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  serviceListIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#FFF0CC",
    alignItems: "center",
    justifyContent: "center",
  },
  serviceText: { flex: 1, minWidth: 0 },
  serviceTitle: { color: "#191D23", fontWeight: "900", fontSize: 17 },
  muted: { color: "#6B7280", fontSize: 12, lineHeight: 18 },
  arrow: { color: "#D38A1C", fontSize: 32 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#C7CBC5",
    borderRadius: 12,
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  choiceActive: { backgroundColor: "#252A32", borderColor: "#252A32" },
  choiceText: { color: "#38404A", fontWeight: "800", fontSize: 12 },
  choiceTextActive: { color: "#FFFFFF" },
  rule: { height: 1, backgroundColor: "#DDE0DB" },
  summary: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 20,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#DDE0DB",
  },
  summaryValue: {
    color: "#191D23",
    fontWeight: "900",
    flex: 1,
    textAlign: "right",
  },
  total: {
    paddingVertical: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  totalLabel: { color: "#191D23", fontSize: 18, fontWeight: "900" },
  totalValue: {
    color: "#A66B16",
    fontSize: 31,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  notice: { backgroundColor: "#E7EFEA", borderRadius: 14, padding: 15 },
  warning: { backgroundColor: "#FFF0CC", marginBottom: 18 },
  noticeTitle: { color: "#191D23", fontWeight: "900" },
  noticeBody: { color: "#4F5964", marginTop: 5, lineHeight: 19 },
  history: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#DDE0DB",
  },
  between: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  historyCode: { color: "#191D23", fontWeight: "900" },
  status: {
    color: "#70460D",
    backgroundColor: "#FCE8BC",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    fontSize: 10,
    fontWeight: "900",
  },
  historyService: {
    color: "#191D23",
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 3,
  },
  tracking: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
  },
  trackingHero: {
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  trackingCopy: { flex: 1, minWidth: 0 },
  trackingTitle: {
    color: "#191D23",
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "900",
    letterSpacing: -0.35,
  },
  trackingEta: { color: "#5D6673", fontSize: 14, lineHeight: 20, marginTop: 4 },
  serviceIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#F4AE3E",
    alignItems: "center",
    justifyContent: "center",
  },
  progressSegments: { flexDirection: "row", gap: 5, paddingHorizontal: 18 },
  progressSegment: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#E4E1D9",
  },
  progressSegmentActive: { backgroundColor: "#D38A1C" },
  progressLabel: {
    color: "#70460D",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    marginHorizontal: 18,
    marginTop: 10,
  },
  responderRow: {
    minHeight: 82,
    paddingHorizontal: 18,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#ECE8DF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  responderIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  responderAvatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#FFF0CC",
    alignItems: "center",
    justifyContent: "center",
  },
  responderText: { flex: 1, minWidth: 0 },
  responderName: { color: "#191D23", fontSize: 16, fontWeight: "900" },
  responderRole: { color: "#5D6673", fontSize: 13, marginTop: 3 },
  callButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#D8D2C5",
    alignItems: "center",
    justifyContent: "center",
  },
  mapFrame: { height: 300, backgroundColor: "#E7EFEA", overflow: "hidden" },
  map: { width: "100%", height: "100%" },
  locationState: {
    position: "absolute",
    left: 12,
    bottom: 12,
    backgroundColor: "#191D23",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: "88%",
  },
  locationStateWarning: { backgroundColor: "#70460D" },
  locationStateText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  receipt: {
    marginTop: 14,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D5D8D3",
    borderRadius: 14,
  },
  receiptTitle: {
    color: "#191D23",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 4,
  },
});
