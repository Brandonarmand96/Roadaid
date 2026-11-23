import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { ServiceType } from "@roadaid/shared";

export default function ServiceIcon({
  service,
  size = 28,
  color = "#191D23",
}: {
  service: ServiceType | string;
  size?: number;
  color?: string;
}) {
  if (service === ServiceType.FUEL) {
    return (
      <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityLabel="Fuel delivery">
        <Rect x="6" y="4" width="14" height="24" rx="3" fill={color} />
        <Rect x="9" y="7" width="8" height="6" rx="1" fill="#F4AE3E" />
        <Path d="M20 9h3l3 4v10.5a1.5 1.5 0 0 0 3 0V15h-2v8.5a.5.5 0 0 1-1 0V12.2L22.5 8H20v1Z" fill={color} />
        <Rect x="4" y="26" width="18" height="3" rx="1.5" fill={color} />
      </Svg>
    );
  }

  if (service === ServiceType.TOWING) {
    return (
      <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityLabel="Vehicle towing">
        <Path d="M3 18h17l4 4h4v4H3v-8Z" fill={color} />
        <Path d="M6 17 10 9h8l5 8H6Z" fill={color} />
        <Path d="M18 8h7v3h-3v5h-3v-5h-1V8Z" fill={color} />
        <Path d="M24 11v6.5c0 2.3 1.4 3.5 3.3 3.5H29v-3h-1.2c-.5 0-.8-.3-.8-.9V11h-3Z" fill={color} />
        <Circle cx="9" cy="26" r="3" fill="#F4AE3E" stroke={color} strokeWidth="2" />
        <Circle cx="23" cy="26" r="3" fill="#F4AE3E" stroke={color} strokeWidth="2" />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityLabel="Vehicle lockout">
      <Path d="M4 18.5 7.5 12h13l4.5 6.5V27H4v-8.5Z" fill={color} />
      <Path d="M9 14.5h10l2.1 4H6.9l2.1-4Z" fill="#F4AE3E" />
      <Circle cx="10" cy="27" r="2.5" fill="#F4AE3E" stroke={color} strokeWidth="2" />
      <Circle cx="21" cy="27" r="2.5" fill="#F4AE3E" stroke={color} strokeWidth="2" />
      <Circle cx="25" cy="8" r="4" fill="none" stroke={color} strokeWidth="3" />
      <Path d="m22 11-8 8v4h4v-3h3v-3h3l2-2-4-4Z" fill={color} />
    </Svg>
  );
}
