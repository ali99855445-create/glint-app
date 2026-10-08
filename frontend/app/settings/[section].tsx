import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  Share,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/src/theme";
import { api, setToken } from "@/src/api/client";
import { Avatar } from "@/src/components/Avatar";
import { Button, Field } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";
export default function SettingsSection() {
  const { section } = useLocalSearchParams<{ section: string }>(),
    { colors: c } = useTheme(),
    router = useRouter(),
    insets = useSafeAreaInsets(),
    toast = useToast(),
    qc = useQueryClient(),
    { user, logout, refresh } = useAuth();
  const [password, setPassword] = useState(""),
    [nextPassword, setNextPassword] = useState(""),
    [code, setCode] = useState(""),
    [secret, setSecret] = useState<any>(null),
    [recovery, setRecovery] = useState<string[]>([]),
    [username, setUsername] = useState(user?.username || ""),
    [busy, setBusy] = useState(false);
  const settings = useQuery({
    queryKey: ["account-settings"],
    queryFn: () => api.get("/account/settings"),
  });
  const sessions = useQuery({
    queryKey: ["account-sessions"],
    queryFn: () => api.get("/account/sessions"),
    enabled: section === "security",
  });
  const activity = useQuery({
    queryKey: ["account-activity"],
    queryFn: () => api.get("/account/activity"),
    enabled: section === "activity",
  });
  async function run(fn: () => Promise<any>, message = "Saved") {
    setBusy(true);
    try {
      const r = await fn();
      toast.show(message, "success");
      return r;
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function save(key: string, value: any) {
    await run(async () => {
      await api.put("/account/settings", { values: { [key]: value } });
      await settings.refetch();
      await qc.invalidateQueries({ queryKey: ["feed"] });
    });
  }
  const row = (label: string, action: () => void, description?: string) => (
    <Pressable
      key={label}
      onPress={action}
      style={{ padding: 16, borderBottomWidth: 1, borderColor: c.border }}
    >
      <Text style={{ fontSize: 16, color: c.onSurface }}>{label} ›</Text>
      {description && (
        <Text style={{ color: c.muted, fontSize: 13, marginTop: 6 }}>
          {description}
        </Text>
      )}
    </Pressable>
  );
  const audience = (key: string, label: string) => (
    <View
      key={key}
      style={{
        padding: 16,
        gap: 10,
        borderBottomWidth: 1,
        borderColor: c.border,
      }}
    >
      <Text style={{ fontSize: 16, color: c.onSurface }}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {["public", "friends", "only_me"].map((v) => (
          <Pressable
            disabled={busy}
            key={v}
            onPress={() => save(key, v)}
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 8,
              backgroundColor:
                settings.data?.[key] === v ? c.brand : c.surfaceSecondary,
            }}
          >
            <Text
              style={{
                textAlign: "center",
                color:
                  settings.data?.[key] === v ? c.onBrandPrimary : c.onSurface,
              }}
            >
              {v === "public"
                ? "Everyone"
                : v === "friends"
                  ? "Friends"
                  : key === "comments"
                    ? "Off"
                    : key === "messages"
                      ? "Nobody"
                      : "Only me"}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
  const toggle = (key: string, label: string) => (
    <View
      key={key}
      style={{
        padding: 16,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Text style={{ fontSize: 16, color: c.onSurface, flex: 1 }}>{label}</Text>
      <Switch
        disabled={busy}
        value={!!settings.data?.[key]}
        onValueChange={(v) => save(key, v)}
      />
    </View>
  );
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <View
        style={{
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Pressable onPress={() => router.back()}>
          <Text style={{ fontSize: 24, color: c.brand }}>‹</Text>
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: "600", color: c.onSurface }}>
          {(
            {
              account: "Account information",
              security: "Login & security",
              notifications: "Notifications",
              followers: "Followers & following",
              privacy: "Posts, stories & messages",
              activity: "Your activity & information",
            } as any
          )[section] || "Settings"}
        </Text>
      </View>
      {settings.isLoading && <ActivityIndicator color={c.brand} />}
      {section === "account" && (
        <>
          <Pressable
            onPress={() => router.push("/edit-profile")}
            style={{
              padding: 16,
              flexDirection: "row",
              gap: 16,
              alignItems: "center",
            }}
          >
            <Avatar uri={user?.avatar} name={user?.full_name} size={64} />
            <Text
              style={{ fontSize: 20, fontWeight: "600", color: c.onSurface }}
            >
              {user?.full_name}
            </Text>
          </Pressable>
          {row("Name", () => router.push("/edit-profile"))}
          <View style={{ padding: 16, gap: 12 }}>
            <Text style={{ color: c.onSurface }}>Username</Text>
            <Field
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              placeholder="Username"
            />
            <Button
              title="Update username"
              loading={busy}
              onPress={() =>
                run(async () => {
                  await api.put("/account/username", { username });
                  await refresh();
                })
              }
            />
          </View>
          {row("Profile picture & cover", () => router.push("/edit-profile"))}
          {row("Avatar & personal details", () =>
            router.push("/profile-details"),
          )}
          {row(
            "Contact info",
            () => router.push("/account-contact"),
            "Add or update your email and phone number with a verification code.",
          )}
        </>
      )}
      {section === "security" && (
        <>
          <View style={{ padding: 16, gap: 12 }}>
            <Text style={{ color: c.muted }}>
              Enter your current password for security changes. If two-step
              verification is on, enter an authenticator or recovery code.
            </Text>
            <Field
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="Current password"
            />
            <Field
              value={code}
              onChangeText={setCode}
              placeholder="Authenticator / recovery code"
              autoCapitalize="none"
            />
            <Text
              style={{ color: c.onSurface, fontSize: 18, fontWeight: "600" }}
            >
              Change password
            </Text>
            <Field
              secureTextEntry
              value={nextPassword}
              onChangeText={setNextPassword}
              placeholder="New password (at least 8 characters)"
            />
            <Button
              title="Change password"
              loading={busy}
              onPress={() =>
                run(async () => {
                  await api.post("/account/password", {
                    password,
                    new_password: nextPassword,
                    code,
                  });
                  await logout();
                  router.replace("/(auth)/login");
                }, "Password changed. Please sign in again.")
              }
            />
            <Text
              style={{ color: c.onSurface, fontSize: 18, fontWeight: "600" }}
            >
              Two-step verification:{" "}
              {settings.data?.two_factor_enabled ? "On" : "Off"}
            </Text>
            {settings.data?.two_factor_enabled ? (
              <Button
                title="Turn off two-step verification"
                loading={busy}
                onPress={() =>
                  run(async () => {
                    await api.post("/account/2fa/disable", { password, code });
                    await settings.refetch();
                  })
                }
              />
            ) : (
              <Button
                title="Set up authenticator"
                loading={busy}
                onPress={() =>
                  run(
                    async () =>
                      setSecret(
                        await api.post("/account/2fa/setup", { password }),
                      ),
                    "Add this key to your authenticator app.",
                  )
                }
              />
            )}
            {secret && !settings.data?.two_factor_enabled && (
              <>
                <Text selectable style={{ color: c.onSurface }}>
                  Authenticator setup key: {secret.secret}
                </Text>
                <Text style={{ color: c.muted }}>
                  Add this key manually in your authenticator app, then enter
                  its six-digit code above.
                </Text>
                <Button
                  title="Enable two-step verification"
                  loading={busy}
                  onPress={() =>
                    run(async () => {
                      const r = await api.post("/account/2fa/enable", {
                        password,
                        code,
                      });
                      setRecovery(r.recovery_codes);
                      setSecret(null);
                      await settings.refetch();
                    })
                  }
                />
              </>
            )}
            {recovery.length > 0 && (
              <>
                <Text style={{ color: c.onSurface, fontWeight: "600" }}>
                  Save these recovery codes securely. Each can be used once.
                </Text>
                <Text selectable style={{ color: c.onSurface, lineHeight: 24 }}>
                  {recovery.join("\n")}
                </Text>
              </>
            )}
          </View>
          {toggle("login_alerts", "Email alerts for new logins")}
          <Text
            style={{
              padding: 16,
              fontSize: 18,
              fontWeight: "600",
              color: c.onSurface,
            }}
          >
            Signed-in devices
          </Text>
          {sessions.data?.map((s: any) => (
            <View
              key={s.id}
              style={{
                padding: 16,
                gap: 8,
                borderBottomWidth: 1,
                borderColor: c.border,
              }}
            >
              <Text style={{ color: c.onSurface }}>
                {s.device || "Glint session"} {s.current ? "(this device)" : ""}
              </Text>
              <Text style={{ color: c.muted }}>{s.created_at}</Text>
              {!s.current && (
                <Button
                  title="Log out this device"
                  onPress={() =>
                    run(async () => {
                      await api.post(`/account/sessions/${s.id}/revoke`);
                      await sessions.refetch();
                    })
                  }
                />
              )}
            </View>
          ))}
          {row("Log out other devices", () =>
            run(async () => {
              const result = await api.post("/account/sessions/logout-others");
              await setToken(result.token);
              await sessions.refetch();
            }),
          )}
          {row("Contact & recovery email", () =>
            router.push("/account-contact"),
          )}
          <View style={{ padding: 16 }}>
            <Button
              title="Deactivate account"
              variant="danger"
              onPress={() =>
                run(async () => {
                  await api.post("/account/deactivate", { password, code });
                  await logout();
                  router.replace("/(auth)/login");
                }, "Account deactivated. Sign in to reactivate it.")
              }
            />
          </View>
        </>
      )}
      {section === "notifications" && (
        <>
          <Text style={{ padding: 16, color: c.muted }}>
            Choose which notifications you receive. These controls do not change
            who can see your content.
          </Text>
          {[
            ["reaction", "Likes & reactions"],
            ["comment", "Comments"],
            ["follow", "New followers"],
            ["friend_request", "Friend requests"],
            ["friend_accept", "Accepted friend requests"],
            ["message", "Messages"],
            ["profile", "Profile updates"],
            ["spark", "Sparks"],
          ].map(([key, label]) => (
            <View key={key} style={{ padding: 16, gap: 10 }}>
              <Text style={{ color: c.onSurface, fontSize: 16 }}>{label}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {["everyone", "friends", "off"].map((v) => (
                  <Pressable
                    disabled={busy}
                    key={v}
                    onPress={() =>
                      save("notifications", {
                        ...settings.data?.notifications,
                        [key]: v,
                      })
                    }
                    style={{
                      flex: 1,
                      padding: 10,
                      backgroundColor:
                        (settings.data?.notifications?.[key] || "everyone") ===
                        v
                          ? c.brand
                          : c.surfaceSecondary,
                      borderRadius: 8,
                    }}
                  >
                    <Text
                      style={{
                        textAlign: "center",
                        color:
                          (settings.data?.notifications?.[key] ||
                            "everyone") === v
                            ? c.onBrandPrimary
                            : c.onSurface,
                      }}
                    >
                      {v === "everyone"
                        ? "On"
                        : v === "friends"
                          ? "Friends"
                          : "Off"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </>
      )}
      {section === "followers" && (
        <>
          {audience("followers_visibility", "Who can see your followers?")}
          {audience("following_visibility", "Who can see who you follow?")}
        </>
      )}
      {section === "privacy" && (
        <>
          {audience("posts_audience", "Default audience for new posts")}
          {audience("stories_audience", "Default audience for new stories")}
          {audience("comments", "Who can comment on your posts?")}
          {audience("messages", "Who can send you messages?")}
          {toggle("active_status", "Show online status")}
          {toggle("read_receipts", "Send read receipts")}
          {row("Blocked users", () => router.push("/blocked"))}
          {row("Inner Circle", () => router.push("/inner-circle"))}
          {row("Hide stories from selected people", () =>
            router.push("/settings/people?kind=hidden_story_users"),
          )}
          {row("Muted people", () =>
            router.push("/settings/people?kind=muted_users"),
          )}
        </>
      )}
      {section === "activity" && (
        <>
          {row("Saved posts", () => router.push("/saved"))}
          {row("Archived posts", () => router.push("/settings/archive"))}
          {row("Download / share your information", () =>
            run(async () => {
              const data = await api.get("/account/export");
              const fs = await import("expo-file-system/legacy");
              const result =
                await fs.StorageAccessFramework.requestDirectoryPermissionsAsync();
              if (!result.granted)
                throw new Error("Choose a folder to save your information.");
              const file = await fs.StorageAccessFramework.createFileAsync(
                result.directoryUri,
                "Glint-account-information.json",
                "application/json",
              );
              await fs.writeAsStringAsync(file, JSON.stringify(data, null, 2));
            }, "Your information is ready."),
          )}
          <Text
            style={{
              padding: 16,
              color: c.onSurface,
              fontSize: 18,
              fontWeight: "600",
            }}
          >
            Recent login activity
          </Text>
          {activity.data?.map((e: any, i: number) => (
            <Text key={i} style={{ padding: 16, color: c.muted }}>
              {e.created_at} · {e.ip || "Device login"}
            </Text>
          ))}
        </>
      )}
    </ScrollView>
  );
}
