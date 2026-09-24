import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { LEGAL_DOCS } from "@/src/legal/content";

export default function LegalScreen() {
  const { doc = "terms" } = useLocalSearchParams<{ doc: string }>();
  const legal = LEGAL_DOCS[doc] || LEGAL_DOCS.terms;
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="legal-back">
          <Icon name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{legal.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name={doc === "privacy" ? "lock-closed" : doc === "guidelines" ? "people" : "document-text"} size={28} color={colors.brandSecondary} />
          </View>
          <Text style={styles.heroTitle}>{legal.title}</Text>
          <Text style={styles.heroSub}>{legal.subtitle}</Text>
          <Text style={styles.updated}>{legal.updated}</Text>
        </View>

        {legal.sections.map((s, i) => (
          <View key={i} style={styles.section} testID={`legal-section-${i}`}>
            <Text style={styles.heading}>{s.heading}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}

        <Text style={styles.footer}>Glint · Shine responsibly ✨</Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: c.onSurface, fontFamily: fonts.display, fontSize: 17, textAlign: "center" },
  content: { padding: spacing.lg, gap: spacing.lg },
  hero: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.md },
  heroIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  heroTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 24 },
  heroSub: { color: c.brandSecondary, fontFamily: fonts.medium, fontSize: 14 },
  updated: { color: c.muted, fontFamily: fonts.text, fontSize: 12, marginTop: spacing.xs },
  section: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  heading: { color: c.brandSecondary, fontFamily: fonts.semibold, fontSize: 15 },
  body: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 14, lineHeight: 22 },
  footer: { color: c.muted, fontFamily: fonts.text, fontSize: 12, textAlign: "center", marginTop: spacing.md },
}));
