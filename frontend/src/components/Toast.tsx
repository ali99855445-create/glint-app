import React, { createContext, useContext, useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, fonts, radius, spacing } from "@/src/theme";
import { Icon } from "./Icon";

type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; message: string; type: ToastType };
type Ctx = { show: (message: string, type?: ToastType) => void };

const ToastCtx = createContext<Ctx>(null as any);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);

  const show = useCallback((message: string, type: ToastType = "info") => {
    setToast({ id: Date.now(), message, type });
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setToast(null));
    }, 2800);
  }, [anim]);

  const bg = toast?.type === "success" ? colors.success : toast?.type === "error" ? colors.error : colors.surfaceInverse;
  const fg = toast?.type === "info" ? colors.onSurfaceInverse : "#FFFFFF";
  const iconName = toast?.type === "success" ? "checkmark-circle" : toast?.type === "error" ? "alert-circle" : "information-circle";

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {toast && (
        <Animated.View
          style={[
            styles.wrap,
            {
              top: insets.top + spacing.sm,
              backgroundColor: bg,
              opacity: anim,
              pointerEvents: "none",
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
            },
          ]}
          testID="toast"
        >
          <Icon name={iconName as any} size={20} color={fg} />
          <Text style={[styles.text, { color: fg }]} numberOfLines={2}>
            {toast.message}
          </Text>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 9999,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  text: { flex: 1, fontSize: 14, fontFamily: fonts.medium },
});
