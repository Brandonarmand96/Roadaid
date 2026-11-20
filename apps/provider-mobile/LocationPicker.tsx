import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import { ArrowLeft, Crosshair, MapPin, Search } from "lucide-react-native";
import * as Location from "expo-location";

type Point = { lat: number; lng: number; address: string; placeId?: string | null };
type Suggestion = { placeId: string; description: string; primaryText: string; secondaryText: string };

export default function LocationPicker({ title, initial, token, apiRequest, onConfirm, onCancel }: {
  title: string;
  initial: Point;
  token: string;
  apiRequest: <T>(path: string, options?: RequestInit, token?: string) => Promise<T>;
  onConfirm: (point: Point) => void;
  onCancel: () => void;
}) {
  const map = useRef<MapView>(null);
  const searchSequence = useRef(0);
  const reverseSequence = useRef(0);
  const [point, setPoint] = useState(initial);
  const [query, setQuery] = useState(initial.address);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 3 || clean === point.address) { setSuggestions([]); return; }
    const sequence = ++searchSequence.current;
    const timer = setTimeout(() => {
      setLoading(true);
      apiRequest<Suggestion[]>("/maps/autocomplete", {
        method: "POST",
        body: JSON.stringify({ input: clean, location: { lat: point.lat, lng: point.lng } }),
      }, token).then((items) => {
        if (sequence === searchSequence.current) setSuggestions(items);
      }).catch((reason) => {
        if (sequence === searchSequence.current) setError(reason instanceof Error ? reason.message : "Location search is unavailable");
      }).finally(() => {
        if (sequence === searchSequence.current) setLoading(false);
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [query, point.address, point.lat, point.lng, token]);

  async function choose(item: Suggestion) {
    setLoading(true); setError("");
    try {
      const selected = await apiRequest<Point>("/maps/place", { method: "POST", body: JSON.stringify({ placeId: item.placeId }) }, token);
      setPoint(selected); setQuery(selected.address); setSuggestions([]);
      map.current?.animateToRegion(region(selected), 350);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load that location"); }
    finally { setLoading(false); }
  }

  async function reverse(next: { lat: number; lng: number }) {
    const sequence = ++reverseSequence.current;
    setPoint({ ...next, address: "Finding this address…" });
    try {
      const resolved = await apiRequest<Point>("/maps/reverse", { method: "POST", body: JSON.stringify(next) }, token);
      if (sequence === reverseSequence.current) { setPoint(resolved); setQuery(resolved.address); }
    } catch {
      if (sequence === reverseSequence.current) { const address = `${next.lat.toFixed(5)}, ${next.lng.toFixed(5)}`; setPoint({ ...next, address }); setQuery(address); }
    }
  }

  async function useGps() {
    setLoading(true); setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Enable precise location in phone settings, then try again.");
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const next = { lat: current.coords.latitude, lng: current.coords.longitude };
      map.current?.animateToRegion(region(next), 350);
      await reverse(next);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Current location is unavailable"); }
    finally { setLoading(false); }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={region(point)} toolbarEnabled={false} showsUserLocation>
        <Marker coordinate={{ latitude: point.lat, longitude: point.lng }} draggable title={title} onDragEnd={(event) => void reverse({ lat: event.nativeEvent.coordinate.latitude, lng: event.nativeEvent.coordinate.longitude })} />
      </MapView>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay} pointerEvents="box-none">
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onCancel} style={styles.iconButton}><ArrowLeft color="#191D23" size={23} /></Pressable>
          <View style={styles.searchBox}><Search color="#59636F" size={20} /><TextInput accessibilityLabel={`${title} search`} value={query} onChangeText={setQuery} placeholder="Search street, landmark or business" placeholderTextColor="#737C87" style={styles.input} returnKeyType="search" />{loading ? <ActivityIndicator color="#191D23" /> : null}</View>
        </View>
        {suggestions.length ? <FlatList keyboardShouldPersistTaps="handled" data={suggestions} keyExtractor={(item) => item.placeId} style={styles.suggestions} renderItem={({ item }) => <Pressable onPress={() => void choose(item)} style={styles.suggestion}><MapPin color="#83520F" size={20} /><View style={styles.suggestionCopy}><Text style={styles.primary}>{item.primaryText}</Text><Text style={styles.secondary} numberOfLines={2}>{item.secondaryText}</Text></View></Pressable>} /> : null}
        {error ? <View accessibilityLiveRegion="polite" style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
        <View style={styles.bottom}>
          <Pressable accessibilityRole="button" accessibilityLabel="Use current GPS location" onPress={() => void useGps()} style={styles.gps}><Crosshair color="#191D23" size={21} /><Text style={styles.gpsText}>Use current location</Text></Pressable>
          <View style={styles.confirmCard}><Text style={styles.title}>{title}</Text><Text style={styles.address}>{point.address || "Move the pin to the exact roadside location"}</Text><Text style={styles.hint}>Drag the pin for a more precise pickup.</Text><Pressable accessibilityRole="button" accessibilityLabel={`Confirm ${title.toLowerCase()}`} disabled={!point.address || loading} onPress={() => onConfirm(point)} style={[styles.confirm, (!point.address || loading) && styles.disabled]}><Text style={styles.confirmText}>Confirm location</Text></Pressable></View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function region(point: { lat: number; lng: number }): Region {
  return { latitude: point.lat, longitude: point.lng, latitudeDelta: 0.025, longitudeDelta: 0.025 };
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#E9ECE8" }, overlay: { flex: 1, justifyContent: "space-between" },
  top: { flexDirection: "row", gap: 10, padding: 14, alignItems: "center" },
  iconButton: { width: 50, height: 50, borderRadius: 15, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", elevation: 5 },
  searchBox: { flex: 1, minHeight: 52, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14, borderRadius: 15, backgroundColor: "#FFFFFF", elevation: 5 },
  input: { flex: 1, minHeight: 50, color: "#191D23", fontSize: 16 },
  suggestions: { position: "absolute", top: 74, left: 74, right: 14, maxHeight: 260, borderRadius: 15, backgroundColor: "#FFFFFF", elevation: 7 },
  suggestion: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#DDE0DB" },
  suggestionCopy: { flex: 1, minWidth: 0 }, primary: { color: "#191D23", fontWeight: "800", fontSize: 15 }, secondary: { color: "#59636F", fontSize: 12, lineHeight: 17, marginTop: 2 },
  error: { marginHorizontal: 14, marginTop: 68, borderRadius: 12, backgroundColor: "#FFF0CC", padding: 12 }, errorText: { color: "#5E3A0B", fontWeight: "700" },
  bottom: { gap: 10, padding: 14 }, gps: { alignSelf: "flex-end", minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 15, borderRadius: 14, backgroundColor: "#FFFFFF", elevation: 5 }, gpsText: { color: "#191D23", fontWeight: "800" },
  confirmCard: { borderRadius: 22, backgroundColor: "#F9FAF8", padding: 18, elevation: 10 }, title: { color: "#191D23", fontSize: 22, fontWeight: "900" }, address: { color: "#263247", fontSize: 16, lineHeight: 22, fontWeight: "700", marginTop: 8 }, hint: { color: "#667185", fontSize: 12, marginTop: 5 },
  confirm: { minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#F4AE3E", marginTop: 15 }, confirmText: { color: "#191D23", fontWeight: "900", fontSize: 15 }, disabled: { opacity: 0.45 },
});
