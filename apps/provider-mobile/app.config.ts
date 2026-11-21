import type { ConfigContext, ExpoConfig } from "expo/config";
import appJson from "./app.json";

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = appJson.expo as ExpoConfig;

  return {
    ...config,
    ...base,
    ios: { ...base.ios },
    android: { ...base.android },
    plugins: [...(base.plugins ?? []), "@maplibre/maplibre-react-native"],
  };
};
