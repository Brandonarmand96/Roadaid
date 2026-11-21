import React, { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import { Camera, CameraRef, GeoJSONSource, Layer, Map, Marker as NativeMarker, UserLocation } from "@maplibre/maplibre-react-native";

export type Coordinate = { latitude: number; longitude: number };
export type Region = Coordinate & { latitudeDelta: number; longitudeDelta: number };
export type MapViewHandle = {
  animateToRegion: (region: Region, duration?: number) => void;
  fitToCoordinates: (points: Coordinate[], options?: { edgePadding?: { top: number; right: number; bottom: number; left: number }; animated?: boolean }) => void;
};

const token = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
const mapStyle = token
  ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${encodeURIComponent(token)}`
  : "https://demotiles.maplibre.org/style.json";

function zoomFor(region: Region) {
  const delta = Math.max(region.latitudeDelta, region.longitudeDelta, 0.0001);
  return Math.max(3, Math.min(18, Math.log2(360 / delta)));
}

const MapView = forwardRef<MapViewHandle, {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  region?: Region;
  showsUserLocation?: boolean;
  showsCompass?: boolean;
  onLongPress?: (event: { nativeEvent: { coordinate: Coordinate } }) => void;
  toolbarEnabled?: boolean;
  showsMyLocationButton?: boolean;
}>(({ children, style, initialRegion, region, showsUserLocation, showsCompass = true, onLongPress }, ref) => {
  const camera = useRef<CameraRef>(null);
  const selected = region ?? initialRegion ?? { latitude: 9.0765, longitude: 7.3986, latitudeDelta: 0.08, longitudeDelta: 0.08 };
  useImperativeHandle(ref, () => ({
    animateToRegion: (next, duration = 350) => camera.current?.easeTo({ center: [next.longitude, next.latitude], zoom: zoomFor(next), duration }),
    fitToCoordinates: (points, options) => {
      if (!points.length) return;
      const lngs = points.map((point) => point.longitude);
      const lats = points.map((point) => point.latitude);
      camera.current?.fitBounds(
        [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
        { padding: options?.edgePadding, duration: options?.animated === false ? 0 : 400 },
      );
    },
  }), []);
  return <Map
    style={style}
    mapStyle={mapStyle}
    compass={showsCompass}
    attribution
    logo
    onLongPress={onLongPress ? (event) => onLongPress({ nativeEvent: { coordinate: { longitude: event.nativeEvent.lngLat[0], latitude: event.nativeEvent.lngLat[1] } } }) : undefined}
  >
    <Camera ref={camera} center={[selected.longitude, selected.latitude]} zoom={zoomFor(selected)} />
    {showsUserLocation ? <UserLocation /> : null}
    {children}
  </Map>;
});
MapView.displayName = "MapView";

let markerCounter = 0;
export function Marker({ coordinate, pinColor = "#D38A1C" }: { coordinate: Coordinate; title?: string; pinColor?: string; draggable?: boolean; onDragEnd?: (event: { nativeEvent: { coordinate: Coordinate } }) => void }) {
  const id = useMemo(() => `marker-${++markerCounter}`, []);
  return <NativeMarker id={id} lngLat={[coordinate.longitude, coordinate.latitude]} anchor="bottom"><View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: pinColor, borderColor: "white", borderWidth: 3 }} /></NativeMarker>;
}

let lineCounter = 0;
export function Polyline({ coordinates, strokeColor = "#D38A1C", strokeWidth = 5 }: { coordinates: Coordinate[]; strokeColor?: string; strokeWidth?: number }) {
  const id = useMemo(() => `route-${++lineCounter}`, []);
  const shape = useMemo(() => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coordinates.map((point) => [point.longitude, point.latitude]) } }), [coordinates]);
  return <GeoJSONSource id={`${id}-source`} data={shape}><Layer id={`${id}-line`} type="line" style={{ lineColor: strokeColor, lineWidth: strokeWidth, lineCap: "round", lineJoin: "round" }} /></GeoJSONSource>;
}

export default MapView;
