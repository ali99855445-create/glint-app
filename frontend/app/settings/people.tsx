import React, { useState } from "react";
import { Text, ScrollView, Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { useTheme } from "@/src/theme";
import { Field } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
export default function People() {
  const { kind } = useLocalSearchParams<{ kind: string }>(),
    key = kind === "hidden_story_users" ? "hidden_story_users" : "muted_users",
    { colors: c } = useTheme(),
    router = useRouter(),
    insets = useSafeAreaInsets(),
    toast = useToast();
  const [q, setQ] = useState("");
  const settings = useQuery({
    queryKey: ["account-settings"],
    queryFn: () => api.get("/account/settings"),
  });
  const users = useQuery({
    queryKey: ["privacy-people", q],
    queryFn: () => api.get("/users/search?q=" + encodeURIComponent(q)),
    enabled: q.trim().length > 0,
  });
  const selected=useQuery({queryKey:["privacy-selected",key],queryFn:()=>api.get("/account/privacy-people?kind="+key)});
  const friends = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get("/friends"),
  });
  async function toggle(id: string) {
    const old = settings.data?.[key] || [],
      next = old.includes(id)
        ? old.filter((x: string) => x !== id)
        : [...old, id];
    try {
      await api.put("/account/settings", { values: { [key]: next } });
      await settings.refetch();
      await selected.refetch();
      toast.show("Preference saved", "success");
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={{
        padding: 20,
        paddingTop: insets.top + 16,
        gap: 16,
      }}
    >
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: c.brand }}>‹ Back</Text>
      </Pressable>
      <Text style={{ fontSize: 22, fontWeight: "600", color: c.onSurface }}>
        {key === "muted_users" ? "Muted people" : "Hide your stories from"}
      </Text>
      <Field value={q} onChangeText={setQ} placeholder="Search people" />
      {(q ? users.data : friends.data)?.map((u: any) => (
        <Pressable
          key={u.id}
          onPress={() => toggle(u.id)}
          style={{ padding: 16, borderBottomWidth: 1, borderColor: c.border }}
        >
          <Text style={{ color: c.onSurface }}>
            {u.full_name} · @{u.username}{" "}
            {settings.data?.[key]?.includes(u.id) ? "✓" : ""}
          </Text>
        </Pressable>
      ))}
      <Text style={{ color: c.muted }}>Selected people</Text>
      {selected.data?.map((person:any)=><Pressable key={person.id} onPress={()=>toggle(person.id)}><Text style={{color:c.brand}}>{person.name||'Unavailable account'}{person.username?' · @'+person.username:''} · Remove</Text></Pressable>)}
    </ScrollView>
  );
}
