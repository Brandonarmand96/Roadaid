import type { ConfigContext, ExpoConfig } from "expo/config";
import appJson from "./app.json";

const androidMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY?.trim();
const iosMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY?.trim();

function requireNativeMapKeys() {
  if (process.env.EAS_BUILD !== "true") return;
  const missing = [
    !androidMapsKey && "EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY",
    !iosMapsKey && "EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY",
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(`Missing native Google Maps build variables: ${missing.join(", ")}`);
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  requireNativeMapKeys();
  const base = appJson.expo as ExpoConfig;

  return {
    ...config,
    ...base,
    ios: {
      ...base.ios,
      ...(iosMapsKey ? { config: { googleMapsApiKey: iosMapsKey } } : {}),
    },
    android: {
      ...base.android,
      ...(androidMapsKey
        ? { config: { googleMaps: { apiKey: androidMapsKey } } }
        : {}),
    },
  };
};
