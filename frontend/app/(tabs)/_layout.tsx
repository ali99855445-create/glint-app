import {ActionSheet,SheetAction} from "@/src/components/MessageActions";
import React, {useState} from "react";
import { View, Text, Pressable } from "react-native";
import { Tabs, useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api/client";
import { Icon } from "@/src/components/Icon";
export default function TabsLayout() {
  const { colors: c } = useTheme(),
    router = useRouter(),
    path = usePathname(),
    insets = useSafeAreaInsets();
  const [menu,setMenu]=useState(false);
  const notifications = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => api.get("/notifications/unread-count"),
    refetchInterval: 15000,
  });
  const requests = useQuery({
    queryKey: ["friend-requests"],
    queryFn: () => api.get("/friends/requests"),
    refetchInterval: 15000,
  });
  const items = [
    ["Home", "home", "/"],
    ["Requests", "people", "/friends"],
    ["Chats", "chatbubble-ellipses", "/chat"],
    ["Profile", "person", "/profile"],
    ["Notifications", "notifications", "/notifications-tab"],
  ];
  return (
    <View
      style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 12,
          gap: 12,
        }}
      >
        <Text style={{ color: c.brand, fontSize: 30, fontWeight: "700" }}>
          Glint
        </Text>
        <Pressable
          accessibilityRole="search"
          onPress={() => router.push("/search")}
          style={{
            flex: 1,
            backgroundColor: c.surfaceSecondary,
            borderRadius: 24,
            padding: 12,
            flexDirection: "row",
            gap: 8,
          }}
        >
          <Icon name="search" size={20} color={c.muted} />
          <Text style={{ color: c.muted }}>Search Glint</Text>
        </Pressable>
        <Pressable accessibilityLabel="Open Glint menu" onPress={()=>setMenu(true)} style={{padding:6}}><Icon name="menu" size={27} color={c.onSurface}/></Pressable>
      </View>
      <ActionSheet visible={menu} onClose={()=>setMenu(false)} title="Glint menu"><SheetAction label="Settings" onPress={()=>{setMenu(false);router.push("/settings");}}/><SheetAction label="Help Center" onPress={()=>{setMenu(false);router.push("/help");}}/><SheetAction label="My profile" onPress={()=>{setMenu(false);router.navigate("/(tabs)/profile");}}/></ActionSheet>
      <View
        style={{
          flexDirection: "row",
          borderBottomWidth: 1,
          borderColor: c.border,
        }}
      >
        {items.map(([label, icon, url]) => {
          const active = path === url;
          return (
            <Pressable
              key={url}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() =>
                router.navigate(
                  (url === "/" ? "/(tabs)" : `/(tabs)${url}`) as any,
                )
              }
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: 10,
                borderBottomWidth: 3,
                borderBottomColor: active ? c.brand : "transparent",
              }}
            >
              <Icon
                name={icon as any}
                size={23}
                color={active ? c.brand : c.muted}
              />
              <Text
                style={{
                  color: active ? c.brand : c.muted,
                  fontSize: 10,
                  marginTop: 4,
                }}
              >
                {label}
                {url === "/friends" && requests.data?.incoming?.length
                  ? " (" + requests.data.incoming.length + ")"
                  : ""}
                {url === "/notifications-tab" && notifications.data?.count
                  ? " (" + notifications.data.count + ")"
                  : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Tabs
        screenOptions={{ headerShown: false, tabBarStyle: { display: "none" } }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="friends" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="profile" />
        <Tabs.Screen name="notifications-tab" />
      </Tabs>
    </View>
  );
}
