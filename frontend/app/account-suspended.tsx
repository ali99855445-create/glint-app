import React, { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme";
import { Button, Field } from "@/src/components/ui";
import { restrictedRequest, setRestrictedToken } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
export default function Suspended() {
  const qc=useQueryClient();
  const { colors: c } = useTheme(),
    insets = useSafeAreaInsets(),
    router = useRouter(),
    toast = useToast();
  const [form, setForm] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  const status = useQuery({
    queryKey: ["restriction"],
    queryFn: () => restrictedRequest("/account/restriction"),
    refetchInterval: 15000,
  });
  async function leave() {
    await qc.cancelQueries();
    qc.clear();
    await setRestrictedToken(null);
    router.replace("/(auth)/login");
  }
  async function submit() {
    setBusy(true);
    try {
      await restrictedRequest("/appeals", { reason });
      setForm(false);
      setReason("");
      await status.refetch();
      toast.show("Your appeal has been sent to the Glint Team.", "success");
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
        padding: 24,
        paddingTop: insets.top + 48,
        gap: 20,
      }}
    >
      <Text style={{ fontSize: 32, fontWeight: "700", color: c.onSurface }}>
        Your account has been suspended
      </Text>
      <Text style={{ fontSize: 16, lineHeight: 25, color: c.muted }}>
        You cannot access your Glint account while it is suspended. Your profile
        is hidden from other users. Access will remain restricted until the
        Glint Team restores your account.
      </Text>
      <Text style={{ fontSize: 16, color: c.onSurface }}>
        Reason: {status.data?.reason || "Account review"}
      </Text>
      {status.isError && (
        <Text style={{ color: c.error }}>
          Unable to load your account status. Sign in again to continue.
        </Text>
      )}
      {status.data?.suspended === false ? (
        <>
          <Text style={{ color: c.success }}>
            Your account has been restored. Please sign in again.
          </Text>
          <Button title="Sign in" onPress={leave} />
        </>
      ) : (
        <>
          {status.data?.appeals?.map((a: any) => (
            <View
              key={a.id}
              style={{
                padding: 16,
                backgroundColor: c.surfaceSecondary,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: c.onSurface }}>
                Appeal:{" "}
                {a.status === "open"
                  ? "Under review by the Glint Team"
                  : a.status}
              </Text>
              {a.response && (
                <Text style={{ color: c.muted, marginTop: 8 }}>
                  {a.response}
                </Text>
              )}
            </View>
          ))}
          {form ? (
            <>
              <Text
                style={{ fontSize: 20, fontWeight: "600", color: c.onSurface }}
              >
                Appeal your suspension
              </Text>
              <Text style={{ color: c.muted }}>
                Explain why you believe this decision should be reviewed.
                Include any details that help us understand your case.
              </Text>
              <Field
                multiline
                value={reason}
                onChangeText={setReason}
                placeholder="Describe your appeal (at least 10 characters)"
              />
              <Button
                title="Submit appeal"
                loading={busy}
                disabled={reason.trim().length < 10}
                onPress={submit}
              />
              <Pressable onPress={() => setForm(false)}>
                <Text style={{ color: c.brand }}>Cancel</Text>
              </Pressable>
            </>
          ) : (
            !status.data?.appeals?.some((a: any) => a.status === "open") && (
              <Button
                title="Appeal this decision"
                onPress={() => setForm(true)}
              />
            )
          )}
        </>
      )}
      <Button title="Back to sign in" variant="secondary" onPress={leave} />
    </ScrollView>
  );
}
