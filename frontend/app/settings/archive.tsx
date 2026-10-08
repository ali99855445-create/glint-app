import React from "react";
import { ScrollView, Text, Pressable, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { useTheme } from "@/src/theme";
import { Button } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
export default function Archive() {
  const { colors: c } = useTheme(),
    router = useRouter(),
    insets = useSafeAreaInsets(),
    toast = useToast(),
    qc = useQueryClient();
  const posts = useQuery({
    queryKey: ["archive"],
    queryFn: () => api.get("/account/archive"),
  });
  return (
    <ScrollView
      style={{ backgroundColor: c.surface, flex: 1 }}
      contentContainerStyle={{
        padding: 20,
        paddingTop: insets.top + 16,
        gap: 16,
      }}
    >
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: c.brand }}>‹ Back</Text>
      </Pressable>
      <Text style={{ fontSize: 24, color: c.onSurface, fontWeight: "600" }}>
        Archived posts
      </Text>
      {posts.data?.map((p: any) => (
        <View
          key={p.id}
          style={{
            padding: 16,
            backgroundColor: c.surfaceSecondary,
            borderRadius: 12,
            gap: 12,
          }}
        >
          <Text style={{ color: c.onSurface }}>
            {p.text || p.type + " post"}
          </Text>
          <Text style={{ color: c.muted }}>{p.created_at}</Text>
          <Button
            title="Restore post"
            onPress={async () => {
              try {
                await api.put(`/account/posts/${p.id}/archive`, {
                  archived: false,
                });
                await posts.refetch();
                qc.invalidateQueries({ queryKey: ["feed"] });
                toast.show("Post restored", "success");
              } catch (e: any) {
                toast.show(e.message, "error");
              }
            }}
          />
        </View>
      ))}
      {posts.data?.length === 0 && (
        <Text style={{ color: c.muted }}>No archived posts.</Text>
      )}
    </ScrollView>
  );
}
