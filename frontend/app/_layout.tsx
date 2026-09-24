import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { LogBox, View, ActivityIndicator } from "react-native";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider } from "@/src/context/AuthContext";
import { ThemeModeProvider } from "@/src/context/ThemeModeContext";
import { ToastProvider } from "@/src/components/Toast";
import { useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "Outfit-Regular": "https://cdn.jsdelivr.net/fontsource/fonts/outfit@latest/latin-400-normal.ttf",
    "Outfit-SemiBold": "https://cdn.jsdelivr.net/fontsource/fonts/outfit@latest/latin-600-normal.ttf",
    "Outfit-Bold": "https://cdn.jsdelivr.net/fontsource/fonts/outfit@latest/latin-700-normal.ttf",
    "Figtree-Regular": "https://cdn.jsdelivr.net/fontsource/fonts/figtree@latest/latin-400-normal.ttf",
    "Figtree-Medium": "https://cdn.jsdelivr.net/fontsource/fonts/figtree@latest/latin-500-normal.ttf",
    "Figtree-SemiBold": "https://cdn.jsdelivr.net/fontsource/fonts/figtree@latest/latin-600-normal.ttf",
  });

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#EAB308" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <ThemeModeProvider>
              <KeyboardProvider>
                <BottomSheetModalProvider>
                  <AuthProvider>
                    <ToastProvider>
                      <ThemedStatusBar />
                      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: "#000000" } }}>
                        <Stack.Screen name="story/[userId]" options={{ animation: "fade", presentation: "fullScreenModal" }} />
                      </Stack>
                    </ToastProvider>
                  </AuthProvider>
                </BottomSheetModalProvider>
              </KeyboardProvider>
            </ThemeModeProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
