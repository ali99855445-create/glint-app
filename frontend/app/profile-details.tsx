import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api/client";
import { useTheme } from "@/src/theme";
import { Button, Field } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { detailLabels } from "@/src/components/ProfileDetails";
const catalogs: Record<string, string[]> = {
  hobbies: [
    "Travelling",
    "Reading",
    "Cooking",
    "Photography",
    "Drawing",
    "Listening to music",
    "Gardening",
    "Gaming",
    "Swimming",
    "Cycling",
    "Running",
    "Hiking",
    "Writing",
    "Dancing",
    "Singing",
    "Fitness",
    "Cricket",
    "Football",
    "Fishing",
    "Learning languages",
    "Volunteering",
    "Technology",
    "Fashion",
    "Crafts",
  ],
  music: [
    "Pop",
    "Rock",
    "Hip-hop",
    "Classical",
    "Jazz",
    "Arabic music",
    "Qawwali",
    "Ghazals",
    "Country",
    "Electronic",
    "Folk",
    "Instrumental",
    "Blues",
    "R&B",
    "Nasheeds",
    "Lo-fi", "Atif Aslam", "Arijit Singh", "A. R. Rahman", "Nusrat Fateh Ali Khan", "Abida Parveen", "Ali Zafar", "Coldplay", "Adele", "Ed Sheeran", "Taylor Swift", "Fairuz", "Amr Diab", "Nancy Ajram", "Always I Miss You",
  ],
  tv_shows: [
    "Documentaries",
    "Comedy",
    "Drama",
    "Science fiction",
    "Travel shows",
    "Sports shows",
    "Cooking shows",
    "Modern Family",
    "Friends",
    "Planet Earth",
    "The Office",
    "Sherlock",
  ],
  films: [
    "Action",
    "Comedy",
    "Drama",
    "Animation",
    "Documentary",
    "Adventure",
    "Science fiction",
    "Romance",
    "Thriller",
  ],
  games: [
    "Chess",
    "Minecraft",
    "PUBG Mobile",
    "Free Fire",
    "Fortnite",
    "Roblox",
    "EA Sports FC",
    "Candy Crush",
    "Call of Duty",
    "Cricket games",
    "Board games",
  ],
  sports: [
    "Cricket",
    "Football",
    "Basketball",
    "Tennis",
    "Swimming",
    "Badminton",
    "Pakistan Cricket Team",
    "Saudi Arabia Football Team",
    "Al Hilal",
    "Al Nassr",
    "Barcelona",
    "Real Madrid",
  ],
  gender: ["Female", "Male", "Non-binary", "Prefer not to say"],
  relationship: [
    "Single",
    "In a relationship",
    "Engaged",
    "Married",
    "Separated",
    "Divorced",
    "Widowed",
  ],
  languages: [
    "English",
    "Urdu",
    "Arabic",
    "Hindi",
    "Punjabi",
    "French",
    "Spanish",
    "Chinese",
    "Bengali",
    "Turkish",
    "Persian",
  ],
};
export default function Details() {
  const { colors: c } = useTheme(),
    router = useRouter(),
    insets = useSafeAreaInsets(),
    toast = useToast(),
    qc = useQueryClient();
  const query = useQuery({
    queryKey: ["own-details"],
    queryFn: () => api.get("/account/details"),
  });
  const [details, setDetails] = useState<any>({}),
    [avatar, setAvatar] = useState<string | null>(null),
    [key, setKey] = useState<string | null>(null),
    [value, setValue] = useState(""),
    [visibility, setVisibility] = useState("only_me"),
    [filter, setFilter] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (query.data) {
      setDetails(query.data.details);
      setAvatar(query.data.avatar_character);
    }
  }, [query.data]);
  function edit(k: string) {
    setKey(k);
    setValue(details[k]?.value || "");
    setVisibility(details[k]?.visibility || "only_me");
    setFilter("");
  }
  function choose(v: string) {
    if (["gender", "relationship"].includes(key || "")) {
      setValue(v);
      return;
    }
    const choices = value.split(" · ").filter(Boolean);
    setValue(
      (choices.includes(v)
        ? choices.filter((x) => x !== v)
        : [...choices, v]
      ).join(" · "),
    );
  }
  async function persist(next: any, character = avatar) {
    setBusy(true);
    try {
      await api.put("/account/details", {
        details: next,
        avatar_character: character,
      });
      setDetails(next);
      setAvatar(character);
      setKey(null);
      await qc.invalidateQueries({ queryKey: ["own-details"] });
      await qc.invalidateQueries({ queryKey: ["profile"] });
      toast.show("Profile details updated", "success");
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={{
        paddingTop: insets.top,
        padding: 16,
        paddingBottom: 48,
      }}
    >
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: c.brand, fontSize: 18 }}>‹ Back</Text>
      </Pressable>
      <Text
        style={{
          fontSize: 24,
          fontWeight: "600",
          color: c.onSurface,
          marginVertical: 20,
        }}
      >
        Edit personal details
      </Text>
      <Text style={{ color: c.muted, lineHeight: 22 }}>
        All details are optional. Choose the interests you want and set an
        audience for each detail. Music entries describe your favourite music;
        you can also enter a song or artist yourself.
      </Text>
      {query.isLoading && <ActivityIndicator color={c.brand} />}
      <Text
        style={{
          fontSize: 18,
          fontWeight: "600",
          color: c.onSurface,
          marginTop: 20,
        }}
      >
        Avatar
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginVertical: 12,
        }}
      >
        {[
          "🙂",
          "😎",
          "👩",
          "👨",
          "🧕",
          "🧑",
          "🐱",
          "🦊",
          "🐼",
          "🦁",
          "🤖",
          "🌸",
        ].map((a) => (
          <Pressable
            disabled={busy}
            key={a}
            onPress={() => persist(details, a)}
            style={{
              padding: 12,
              borderRadius: 12,
              backgroundColor:
                avatar === a ? c.brandTertiary : c.surfaceSecondary,
            }}
          >
            <Text style={{ fontSize: 30 }}>{a}</Text>
          </Pressable>
        ))}
      </View>
      {avatar && (
        <Pressable onPress={() => persist(details, null)}>
          <Text style={{ color: c.brand }}>Remove avatar</Text>
        </Pressable>
      )}
      <Pressable onPress={()=>router.push('/account-contact')} style={{paddingVertical:18}}><Text style={{color:c.brand,fontSize:17}}>Contact info: email & phone ›</Text></Pressable>
      <Pressable onPress={()=>router.push('/blue-links')} style={{paddingVertical:18}}><Text style={{color:c.brand,fontSize:17}}>External social links (Blue benefit) ›</Text></Pressable>
      {Object.entries(detailLabels).map(([k, label]) => (
        <Pressable
          key={k}
          onPress={() => edit(k)}
          style={{
            paddingVertical: 18,
            borderBottomWidth: 1,
            borderColor: c.border,
            flexDirection: "row",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 17, fontWeight: "500", color: c.onSurface }}
            >
              {label}
            </Text>
            <Text style={{ fontSize: 15, color: c.muted, marginTop: 5 }}>
              {details[k]?.value || `Add ${label.toLowerCase()}`}
            </Text>
            {details[k]?.value && (
              <Text style={{ color: c.muted, fontSize: 12, marginTop: 5 }}>
                {details[k].visibility.replace("_", " ")}
              </Text>
            )}
          </View>
          <Text style={{ color: c.brand, fontSize: 20 }}>✎</Text>
        </Pressable>
      ))}
      <Modal
        visible={!!key}
        animationType="slide"
        onRequestClose={() => setKey(null)}
      >
        <ScrollView
          style={{ backgroundColor: c.surface, flex: 1 }}
          contentContainerStyle={{
            padding: 20,
            paddingTop: insets.top + 20,
            gap: 16,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={() => setKey(null)}>
            <Text style={{ color: c.brand }}>Cancel</Text>
          </Pressable>
          <Text style={{ fontSize: 24, fontWeight: "600", color: c.onSurface }}>
            {detailLabels[key || ""]}
          </Text>
          <Field
            value={value}
            onChangeText={setValue}
            maxLength={500}
            multiline
            placeholder={
              key === "birthday"
                ? "YYYY-MM-DD"
                : "Enter your own details or select below"
            }
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {["public", "friends", "only_me"].map((v) => (
              <Pressable
                key={v}
                onPress={() => setVisibility(v)}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor:
                    visibility === v ? c.brand : c.surfaceSecondary,
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    color: visibility === v ? c.onBrandPrimary : c.onSurface,
                  }}
                >
                  {v === "public"
                    ? "Public"
                    : v === "friends"
                      ? "Friends"
                      : "Only me"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Button
            title="Save detail"
            loading={busy}
            onPress={() => {
              if (
                key === "birthday" &&
                value &&
                !/^\d{4}-\d{2}-\d{2}$/.test(value)
              )
                return toast.show("Use YYYY-MM-DD for your birthday", "error");
              persist({
                ...details,
                [key!]: { value: value.trim(), visibility },
              });
            }}
          />
          {catalogs[key || ""] && (
            <>
              <Field
                value={filter}
                onChangeText={setFilter}
                placeholder="Search suggestions"
              />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {catalogs[key || ""]
                  .filter((v) => v.toLowerCase().includes(filter.toLowerCase()))
                  .map((v) => (
                    <Pressable
                      key={v}
                      onPress={() => choose(v)}
                      style={{
                        padding: 12,
                        borderRadius: 20,
                        backgroundColor: value.split(" · ").includes(v)
                          ? c.brandTertiary
                          : c.surfaceSecondary,
                        borderWidth: 1,
                        borderColor: c.border,
                      }}
                    >
                      <Text style={{ color: c.onSurface }}>
                        {v}
                        {value.split(" · ").includes(v) ? " ✓" : ""}
                      </Text>
                    </Pressable>
                  ))}
              </View>
            </>
          )}
        </ScrollView>
      </Modal>
    </ScrollView>
  );
}
