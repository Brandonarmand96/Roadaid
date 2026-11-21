"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";

type Provider = { providerId: string; fullName?: string | null; availability: string; lat: number; lng: number };
type Request = { id: string; code: string; status: string; lat: number; lng: number };

export function LiveMap({ providers, requests }: { providers: Provider[]; requests: Request[] }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap>();
  const markers = useRef<Marker[]>([]);

  useEffect(() => {
    if (!host.current || map.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
    const instance = new maplibregl.Map({
      container: host.current,
      center: [7.3986, 9.0765],
      zoom: 11,
      style: token
        ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${encodeURIComponent(token)}`
        : "https://demotiles.maplibre.org/style.json",
    });
    map.current = instance;
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    return () => { map.current?.remove(); map.current = undefined; };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = [
      ...providers.map((provider) => createMarker(provider.lng, provider.lat, provider.availability === "BUSY" ? "#f59e0b" : "#059669", `${provider.fullName || "Provider"} · ${provider.availability}`)),
      ...requests.map((request) => createMarker(request.lng, request.lat, "#b91c1c", `${request.code} · ${request.status}`, true)),
    ];
    markers.current.forEach((marker) => marker.addTo(map.current!));
  }, [providers, requests]);

  return <div ref={host} className="h-full min-h-[390px]" aria-label="Live provider and active request map" />;
}

function createMarker(lng: number, lat: number, color: string, title: string, square = false) {
  const element = document.createElement("div");
  element.title = title;
  element.style.cssText = `width:${square ? 18 : 16}px;height:${square ? 18 : 16}px;background:${color};border:3px solid white;box-shadow:0 1px 5px #0008;border-radius:${square ? 2 : 50}%;${square ? "transform:rotate(45deg);" : ""}`;
  return new maplibregl.Marker({ element }).setLngLat([lng, lat]).setPopup(new maplibregl.Popup({ offset: 18 }).setText(title));
}
