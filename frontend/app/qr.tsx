import { View, Text, Pressable, Share } from "react-native";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { Avatar, UserName } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { Button } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";

export default function QRShare() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();

  const link = `glint.app/${user?.username}`;

  async function copy() {
    await Clipboard.setStringAsync(link);
    toast.show("Link copied!", "success");
  }
  async function share() {
    try { await Share.share({ message: `Follow me on Glint: ${link}` }); } catch {}
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="qr-back">
          <Icon name="close" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Share profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <Avatar uri={user?.avatar} name={user?.full_name} size={72} />
          <View style={styles.nameRow}>
            <UserName name={user?.full_name} verified={user?.verified} size={20} />
          </View>
          <Text style={styles.handle}>{link}</Text>
          <View style={styles.qrWrap}>
            <QRCode value={`https://${link}`} size={200} color={colors.onSurface} backgroundColor={colors.surfaceSecondary} />
          </View>
          <Text style={styles.hint}>Scan to view {user?.full_name?.split(" ")[0]}&apos;s Glint profile</Text>
        </View>

        <View style={styles.actions}>
          <Button title="Copy link" variant="secondary" icon={<Icon name="copy-outline" size={18} color={colors.onSurfaceTertiary} />} onPress={copy} testID="qr-copy" style={{ flex: 1 }} />
          <Button title="Share" icon={<Icon name="share-social-outline" size={18} color={colors.onBrandPrimary} />} onPress={share} testID="qr-share-btn" style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: c.onSurface, fontFamily: fonts.display, fontSize: 18 },
  content: { flex: 1, padding: spacing.xl, gap: spacing.xl, justifyContent: "center" },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.xl, alignItems: "center", gap: spacing.md },
  nameRow: { flexDirection: "row" },
  handle: { color: c.brand, fontFamily: fonts.medium, fontSize: 15 },
  qrWrap: { padding: spacing.lg, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, marginTop: spacing.sm },
  hint: { color: c.muted, fontFamily: fonts.text, fontSize: 14, textAlign: "center" },
  actions: { flexDirection: "row", gap: spacing.md },
}));
