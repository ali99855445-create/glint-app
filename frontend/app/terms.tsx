import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme, fonts, spacing } from "@/src/theme";
import { Icon } from "@/src/components/Icon";

const SECTIONS = [
  { h: "1. Acceptance of Terms", p: "By creating a Glint account you agree to these Terms of Service. If you do not agree, please do not use Glint." },
  { h: "2. Your Account", p: "You are responsible for keeping your login credentials secure and for all activity on your account. Usernames must be unique and not impersonate others." },
  { h: "3. Content Ownership", p: "You retain ownership of the content you post. By posting, you grant Glint a licence to display and distribute that content within the app." },
  { h: "4. Prohibited Conduct", p: "No harassment, hate speech, spam, illegal content, or impersonation. Violations may result in content removal or account suspension." },
  { h: "5. Privacy", p: "We process your data to operate Glint. You can control profile visibility (Public or Friends Only) and delete your account at any time, which purges your data." },
  { h: "6. Termination", p: "We may suspend or terminate accounts that violate these terms. You may delete your account from Settings at any time." },
];

export default function Terms() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="terms-back">
          <Icon name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.hTitle}>Terms of Service</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {SECTIONS.map((s) => (
          <View key={s.h} style={{ gap: spacing.sm }}>
            <Text style={styles.secH}>{s.h}</Text>
            <Text style={styles.secP}>{s.p}</Text>
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
  secH: { color: c.onSurface, fontFamily: fonts.semibold, fontSize: 17 },
  secP: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 15, lineHeight: 23 },
}));
