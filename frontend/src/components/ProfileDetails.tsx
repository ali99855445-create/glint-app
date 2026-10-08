import React, { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/src/theme";
export const detailLabels: Record<string, string> = {
  current_city: "Current city",
  hometown: "Hometown",
  birthday: "Birthday",
  gender: "Gender",
  relationship: "Relationship",
  family: "Family",
  languages: "Languages",
  work: "Work experience",
  school: "School / college",
  university: "University",
  hobbies: "Hobbies",
  music: "Music",
  tv_shows: "TV shows",
  films: "Films",
  games: "Games",
  sports: "Sports teams & athletes",
  places: "Places visited",
};
export function ProfileDetails({
  details,
  editable = false,
  avatar,
}: {
  details: any;
  editable?: boolean;
  avatar?: string;
}) {
  const { colors: c } = useTheme(),
    router = useRouter();
  const [more, setMore] = useState(false),
    [showAvatar, setShowAvatar] = useState(true);
  useEffect(() => {
    setShowAvatar(true);
    const timer = setTimeout(() => setShowAvatar(false), 2200);
    return () => clearTimeout(timer);
  }, [avatar]);
  const entries = Object.entries(details || {}).filter(
    ([k, v]: any) => detailLabels[k] && v?.value,
  );
  return (
    <View style={{ marginVertical: 20, gap: 12 }}>
      {avatar && showAvatar && (
        <Text style={{ fontSize: 42, textAlign: "center" }}>{avatar}</Text>
      )}
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 20, fontWeight: "600", color: c.onSurface }}>
          About
        </Text>
        {editable && (
          <Pressable onPress={() => router.push("/profile-details")}>
            <Text style={{ color: c.brand, fontSize: 17 }}>Edit ✎</Text>
          </Pressable>
        )}
      </View>
      {entries.slice(0, more ? entries.length : 3).map(([k, v]: any) => (
        <View key={k} style={{ gap: 4 }}>
          <Text style={{ color: c.muted, fontSize: 13 }}>
            {detailLabels[k]}
          </Text>
          <Text style={{ color: c.onSurface, fontSize: 16 }}>{v.value}</Text>
        </View>
      ))}
      {entries.length > 3 && (
        <Pressable onPress={() => setMore(!more)}>
          <Text style={{ color: c.brand }}>
            {more ? "See fewer details" : "See more details"}
          </Text>
        </Pressable>
      )}
      {!entries.length && editable && (
        <Pressable onPress={() => router.push("/profile-details")}>
          <Text style={{ color: c.brand }}>
            Add personal details and interests
          </Text>
        </Pressable>
      )}
    </View>
  );
}
