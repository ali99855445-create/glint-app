import React from "react";
import {
  Pressable,
  Text,
  View,
  ActivityIndicator,
  TextInput,
  StyleProp,
  ViewStyle,
  TextStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { makeStyles, useTheme, fonts, radius, spacing } from "@/src/theme";

// ---------------- Button ----------------
type BtnProps = {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  small?: boolean;
};

export function Button({ title, onPress, variant = "primary", loading, disabled, icon, style, testID, small }: BtnProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  const bg =
    variant === "primary" ? colors.brandPrimary
    : variant === "secondary" ? colors.surfaceTertiary
    : variant === "danger" ? colors.error
    : "transparent";
  const fg =
    variant === "primary" ? colors.onBrandPrimary
    : variant === "danger" ? colors.onError
    : variant === "ghost" ? colors.brand
    : colors.onSurfaceTertiary;

  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (isDisabled) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.pill,
          paddingVertical: small ? spacing.sm : spacing.md + 2,
          paddingHorizontal: spacing.xl,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.sm,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon}
          <Text style={{ color: fg, fontFamily: fonts.semibold, fontSize: small ? 14 : 16 }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

// ---------------- Field ----------------
type FieldProps = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
  multiline?: boolean;
  testID?: string;
  icon?: React.ReactNode;
  maxLength?: number;
  style?: StyleProp<ViewStyle>;
};

export function Field({ value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, multiline, testID, icon, maxLength, style }: FieldProps) {
  const { colors } = useTheme();
  const styles = fieldStyles();
  return (
    <View style={[styles.wrap, multiline && { alignItems: "flex-start" }, style]}>
      {icon}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        maxLength={maxLength}
        style={[styles.input, multiline && { height: 100, textAlignVertical: "top" }]}
      />
    </View>
  );
}

const fieldStyles = makeStyles((c) => ({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: c.surfaceTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  input: { flex: 1, fontSize: 16, color: c.onSurface, fontFamily: fonts.text, padding: 0 },
}));

// ---------------- Card ----------------
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = cardStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}
const cardStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
  },
}));

// ---------------- Text helpers ----------------
export function TitleText({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return <Text style={[{ color: colors.onSurface, fontFamily: fonts.displayBold, fontSize: 24 }, style]}>{children}</Text>;
}
