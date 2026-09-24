import React from "react";
import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme, fonts } from "@/src/theme";
import { usesNativeTabs } from "@/src/navigation";
import { Icon } from "@/src/components/Icon";

export default function TabsLayout() {
  const { colors } = useTheme();
  const { signedIn } = useAuth();
  const requests = useQuery({
    queryKey: ["friend-requests"],
    queryFn: () => api.get("/friends/requests"),
    enabled: signedIn,
    refetchInterval: 20000,
  });
  const requestCount = requests.data?.incoming?.length || 0;

  if (usesNativeTabs) {
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="house.fill" />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="friends">
          <NativeTabs.Trigger.Icon sf="person.2.fill" />
          <NativeTabs.Trigger.Label>Friends</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="chat">
          <NativeTabs.Trigger.Icon sf="message.fill" />
          <NativeTabs.Trigger.Label>Chats</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile">
          <NativeTabs.Trigger.Icon sf="person.crop.circle.fill" />
          <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
      }}
      screenListeners={{
        tabPress: () => Haptics.selectionAsync().catch(() => {}),
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, size }) => <Icon name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="friends" options={{ title: "Friends", tabBarBadge: requestCount > 0 ? requestCount : undefined, tabBarBadgeStyle: { backgroundColor: colors.error, color: colors.onError, fontSize: 10 }, tabBarIcon: ({ color, size }) => <Icon name="people" size={size} color={color} /> }} />
      <Tabs.Screen name="chat" options={{ title: "Chats", tabBarIcon: ({ color, size }) => <Icon name="chatbubble-ellipses" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <Icon name="person" size={size} color={color} /> }} />
    </Tabs>
  );
}
