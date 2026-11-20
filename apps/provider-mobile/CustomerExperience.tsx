import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import { FuelType, LockType, ServiceType } from "@roadaid/shared";
import { io } from "socket.io-client";
import MapView, { Marker, Polyline } from "react-native-maps";
import { Bike, Phone, Truck, Wrench } from "lucide-react-native";

declare const process: { env: { EXPO_PUBLIC_API_URL?: string } };
const rawApi = (
  process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3000"
).replace(/\/+$/, "");
const API = rawApi.endsWith("/v1") ? rawApi : `${rawApi}/v1`;
type Screen = "home" | "details" | "quote" | "history";
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
  provider?: { fullName?: string; phone: string } | null;
  payments?: Array<{
    reference: string;
    gateway: string;
    status: string;
    paidAt?: string | null;
  }>;
};
type ProviderPosition = {
  requestId: string;
  lat: number;
  lng: number;
  heading?: number;
  receivedAt: string;
};

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
  const [positions, setPositions] = useState<Record<string, ProviderPosition>>(
    {},
  );
  const [, setClock] = useState(0);
  useEffect(() => {
    if (!token || screen !== "history") return;
    const refresh = () =>
      request<RoadRequest[]>("/requests", {}, token)
        .then(setHistory)
        .catch(() => undefined);
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [token, screen]);
  useEffect(() => {
    if (!token || screen !== "history") return;
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
  }, [token, screen]);
  useEffect(() => {
    if (screen !== "history") return;
    const timer = setInterval(() => setClock((value) => value + 1), 15000);
    return () => clearInterval(timer);
  }, [screen]);
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
      setPickup((p) => ({
        ...p,
        lat: point.coords.latitude,
        lng: point.coords.longitude,
      }));
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
  async function create() {
    if (!service) return;
    await act(async () => {
      await request(
        "/requests",
        {
          method: "POST",
          body: JSON.stringify({
            serviceType: service,
            pickup,
            details: details(),
          }),
        },
        token,
      );
      await loadHistory();
    });
  }
  async function cancel(id: string) {
    await act(async () => {
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
    });
  }
  async function pay(id: string) {
    await act(async () => {
      const initialized = await request<{ authorizationUrl: string }>(
        "/payments/initialize",
        { method: "POST", body: JSON.stringify({ requestId: id }) },
        token,
      );
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
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <Header onPress={token ? () => setScreen("home") : undefined} />
      <ScrollView
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
      >
        {onProviderMode ? (
          <Link label="Switch to Provider mode" onPress={onProviderMode} />
        ) : null}
        <Link label="Sign out" onPress={onSignOut} />
        {error ? (
          <Notice title="We could not continue" body={error} warning />
        ) : null}
        {screen === "home" && (
          <Section
            title="What happened?"
            intro="Choose the assistance you need. You will review the exact price before sending the request."
          >
            <Service
              serviceType={ServiceType.FUEL}
              label="Emergency fuel"
              detail="Delivered by a verified dispatch rider"
              onPress={() => {
                setService(ServiceType.FUEL);
                setScreen("details");
              }}
            />
            <Service
              serviceType={ServiceType.TOWING}
              label="Vehicle towing"
              detail="A verified tow operator comes to you"
              onPress={() => {
                setService(ServiceType.TOWING);
                setScreen("details");
              }}
            />
            <Service
              serviceType={ServiceType.LOCKOUT}
              label="Vehicle lockout"
              detail="A roadside technician helps you regain access"
              onPress={() => {
                setService(ServiceType.LOCKOUT);
                setScreen("details");
              }}
            />
            <Link
              label="View request history"
              onPress={() => void loadHistory()}
            />
          </Section>
        )}
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
                />
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
            <Field
              label="Pickup note (optional)"
              value={pickup.note}
              onChangeText={(note) => setPickup({ ...pickup, note })}
            />
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
        {screen === "quote" && quote && service && (
          <Section
            title="Review before requesting"
            intro="This price is calculated by RoadAid and will be locked when you confirm."
          >
            <Summary label="Service" value={service} />
            <Summary label="Pickup" value={pickup.address} />
            <Summary label="Base" value={money(quote.breakdown.baseKobo)} />
            <Summary
              label="Service charge"
              value={money(quote.breakdown.variableKobo)}
            />
            <View style={s.total}>
              <Text style={s.totalLabel}>Total</Text>
              <Text style={s.totalValue}>{money(quote.priceKobo)}</Text>
            </View>
            <Button
              label="Request assistance"
              busy={busy}
              onPress={() => void create()}
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
    </SafeAreaView>
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
function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.link}>
      <Text style={s.linkText}>{label}</Text>
    </Pressable>
  );
}
function Service({
  serviceType,
  label,
  detail,
  onPress,
}: {
  serviceType: ServiceType;
  label: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={s.service}>
      <View style={s.serviceContent}>
        <View style={s.serviceListIcon}>
          {servicePresentation(serviceType).icon}
        </View>
        <View style={s.serviceText}>
          <Text style={s.serviceTitle}>{label}</Text>
          <Text style={s.muted}>{detail}</Text>
        </View>
      </View>
      <Text style={s.arrow}>›</Text>
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
