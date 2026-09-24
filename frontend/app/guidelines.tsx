import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme, fonts, spacing } from "@/src/theme";
import { Icon } from "@/src/components/Icon";

const SECTIONS = [
  { h: "Be kind", p: "Treat everyone with respect. Bullying, harassment, and threats have no place on Glint." },
  { h: "Keep it authentic", p: "Be yourself. Don't impersonate others or create misleading accounts." },
  { h: "No hate speech", p: "Content that attacks people based on race, ethnicity, religion, gender, or identity is not allowed." },
  { h: "Safe content", p: "No graphic violence, adult content, or anything that endangers minors. Report anything that crosses the line." },
  { h: "No spam", p: "Don't post repetitive content, scams, or misleading links. Keep the feed genuine." },
  { h: "Report & protect", p: "Use the report and block tools to keep your experience safe. Our team reviews every report." },
];

export default function Guidelines() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="guidelines-back">
          <Icon name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.hTitle}>Community Guidelines</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {SECTIONS.map((s) => (
          <View key={s.h} style={styles.item}>
            <View style={styles.iconWrap}><Icon name="shield-checkmark" size={20} color={colors.brand} /></View>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={styles.secH}>{s.h}</Text>
              <Text style={styles.secP}>{s.p}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  hTitle: { color: c.onSurface, fontFamily: fonts.display, fontSize: 18 },
  scroll: { padding: spacing.xl, gap: spacing.xl },
  item: { flexDirection: "row", gap: spacing.md },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  secH: { color: c.onSurface, fontFamily: fonts.semibold, fontSize: 17 },
  secP: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 15, lineHeight: 22 },
}));
