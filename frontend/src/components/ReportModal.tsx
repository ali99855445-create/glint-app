import React, { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { api } from "@/src/api/client";
import { Icon } from "@/src/components/Icon";
import { Button } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";

const ACCOUNT_REASONS = [
  "Impersonation",
  "Fake account",
  "Harassment or bullying",
  "Hate speech",
  "Scam or fraud",
  "Spam",
  "Underage user",
  "Nudity or sexual content",
  "Violence or threats",
  "Copyright or trademark",
  "Privacy violation",
  "Other",
];

const POST_REASONS = [
  "Copyright or trademark",
  "Impersonation or misleading identity",
  "Fake or misleading content",
  "Spam",
  "Harassment or bullying",
  "Hate speech",
  "Nudity or sexual content",
  "Violence or threats",
  "Illegal or regulated goods",
  "Self-harm content",
  "Privacy violation",
  "Other",
];

export function ReportModal({
  visible,
  onClose,
  targetType,
  targetId,
}: {
  visible: boolean;
  onClose: () => void;
  targetType: "user" | "post";
  targetId: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (visible) setReason("");
  }, [visible]);

  const reasons = useMemo(() => targetType === "user" ? ACCOUNT_REASONS : POST_REASONS, [targetType]);

  const submit = useMutation({
    mutationFn: () => api.post("/report", { target_type: targetType, target_id: targetId, reason }),
    onSuccess: () => {
      toast.show("Report submitted. Thank you.", "success");
      onClose();
    },
    onError: (e: any) => toast.show(e.message || "Could not submit report", "error"),
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Report {targetType === "user" ? "account" : "post"}</Text>
              <Text style={styles.subtitle}>Choose the reason that best describes the problem.</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={22} color={colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator={false}>
            {reasons.map((item) => {
              const selected = reason === item;
              return (
                <Pressable
                  key={item}
                  onPress={() => setReason(item)}
                  style={[styles.reasonRow, selected && styles.reasonRowSelected]}
                  testID={`report-reason-${item.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                >
                  <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>{item}</Text>
                  <Icon
                    name={selected ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={selected ? colors.brand : colors.muted}
                  />
                </Pressable>
              );
            })}
          </ScrollView>

          <Button
            title="Submit report"
            onPress={() => reason && submit.mutate()}
            loading={submit.isPending}
            disabled={!reason}
            testID="report-submit"
          />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { maxHeight: "84%", backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  handle: { width: 46, height: 5, borderRadius: 999, backgroundColor: c.borderStrong, alignSelf: "center", marginBottom: spacing.xs },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  title: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 22 },
  subtitle: { color: c.muted, fontFamily: fonts.text, fontSize: 13, marginTop: 4, maxWidth: 280 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  list: { flexGrow: 0 },
  reasonRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: c.surfaceSecondary },
  reasonRowSelected: { borderColor: c.brand, backgroundColor: c.brandTertiary },
  reasonText: { flex: 1, color: c.onSurface, fontFamily: fonts.medium, fontSize: 14, paddingRight: spacing.md },
  reasonTextSelected: { color: c.onBrandTertiary, fontFamily: fonts.semibold },
}));
