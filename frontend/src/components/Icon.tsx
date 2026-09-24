import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";

type Props = {
  name: React.ComponentProps<typeof Ionicons>["name"];
  size?: number;
  color?: string;
};

export function Icon({ name, size = 24, color }: Props) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default Icon;
