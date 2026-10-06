import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import type { ColorValue } from "react-native";

type Props = {
  name: React.ComponentProps<typeof Ionicons>["name"];
  size?: number;
  color?: ColorValue;
};

export function Icon({ name, size = 24, color }: Props) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default Icon;
