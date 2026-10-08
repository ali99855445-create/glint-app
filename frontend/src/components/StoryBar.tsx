import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useTheme } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";
import { Avatar } from "@/src/components/Avatar";
import { fileUrl } from "@/src/api/client";
export function StoryBar({ groups }: { groups: any[] }) {
  const { colors: c } = useTheme(),
    { user } = useAuth(),
    router = useRouter();
  const card = {
    width: 124,
    height: 200,
    borderRadius: 14,
    overflow: "hidden" as const,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
  };
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, padding: 12 }}
    >
      <Pressable style={card} onPress={() => router.push("/story/create")}>
        <Image
          source={{ uri: fileUrl(user?.avatar) }}
          style={{ width: "100%", height: 144 }}
          contentFit="cover"
        />
        <Text style={{ color: c.brand, fontSize: 28, textAlign: "center" }}>
          +
        </Text>
        <Text
          style={{ color: c.onSurface, textAlign: "center", fontWeight: "600" }}
        >
          Create story
        </Text>
      </Pressable>
      {groups.map((g) => {
        const story = g.stories?.[0],
          preview =
            story?.image ||
            (story?.type === "image" ? story?.media : null) ||
            g.author.avatar;
        return (
          <Pressable
            key={g.author.id}
            style={card}
            onPress={() => router.push(`/story/${g.author.id}`)}
          >
            {preview ? (
              <Image
                source={{ uri: fileUrl(preview) }}
                style={{ position: "absolute", width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{
                  flex: 1,
                  backgroundColor: story?.bg_color || c.brand,
                  padding: 10,
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff" }} numberOfLines={5}>
                  {story?.text || "View story"}
                </Text>
              </View>
            )}
            <View
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                borderRadius: 24,
                borderWidth: 3,
                borderColor: g.has_unseen ? c.brand : c.border,
              }}
            >
              <Avatar
                uri={g.author.avatar}
                name={g.author.full_name}
                size={34}
              />
            </View>
            <View
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                padding: 10,
                backgroundColor: "rgba(0,0,0,0.45)",
              }}
            >
              <Text
                style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}
                numberOfLines={2}
              >
                {g.is_mine ? "Your story" : g.author.full_name}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
