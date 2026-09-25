import { useState, useEffect } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { Field, Button } from "@/src/components/ui";
import { Avatar } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { api, fileUrl } from "@/src/api/client";
import { pickAndUploadImage } from "@/src/lib/media";

const DEFAULT_COVER = "https://images.unsplash.com/photo-1511081692775-05d0f180a065?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzNTl8MHwxfHNlYXJjaHwxfHxhZXN0aGV0aWMlMjBjYWZlJTIwaW50ZXJpb3J8ZW58MHx8fHwxNzkwMjcxMjM2fDA&ixlib=rb-4.1.0&q=85";

export default function EditProfile() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user, refresh } = useAuth();

  const [fullName, setFullName] = useState(user?.full_name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [location, setLocation] = useState(user?.location || "");
  const [avatar, setAvatar] = useState(user?.avatar || null);
  const [cover, setCover] = useState(user?.cover || null);
  const [saving, setSaving] = useState(false);

  // AuthContext user can load AFTER this screen mounts (cold open / refresh).
  // Sync the form once the user object arrives so fields are never blank
  // and Save never wipes existing profile data.
  useEffect(() => {
    if (user) {
      setFullName(user.full_name || "");
      setBio(user.bio || "");
      setLocation(user.location || "");
      setAvatar(user.avatar || null);
      setCover(user.cover || null);
    }
  }, [user?.id]);

  async function changeAvatar() {
    try {
      const r = await pickAndUploadImage({ aspect: [1, 1] });
      if (r?.denied) return toast.show("Photo permission needed", "error");
      if (r?.url) setAvatar(r.url);
    } catch (e: any) {
      toast.show(e.message || "Upload failed", "error");
    }
  }
  async function changeCover() {
    try {
      const r = await pickAndUploadImage({ aspect: [16, 9] });
      if (r?.denied) return toast.show("Photo permission needed", "error");
      if (r?.url) setCover(r.url);
    } catch (e: any) {
      toast.show(e.message || "Upload failed", "error");
    }
  }

  async function save() {
    if (!fullName.trim()) return toast.show("Name can't be empty", "error");
    setSaving(true);
    try {
      await api.put("/users/me", { full_name: fullName.trim(), bio: bio.trim() || null, location: location.trim() || null, avatar, cover });
      await refresh();
      toast.show("Profile updated", "success");
      router.back();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="edit-back"><Icon name="close" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Edit Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ paddingBottom: spacing["2xl"] }} keyboardShouldPersistTaps="handled" bottomOffset={20}>
        <Pressable style={styles.coverWrap} onPress={changeCover} testID="edit-cover">
          <Image source={{ uri: fileUrl(cover) || DEFAULT_COVER }} style={styles.cover} contentFit="cover" />
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.4)"]} style={styles.coverScrim} />
          <View style={styles.coverEdit}><Icon name="camera" size={18} color="#FFFFFF" /><Text style={styles.coverEditText}>Change cover</Text></View>
        </Pressable>

        <View style={styles.avatarWrap}>
          <Pressable onPress={changeAvatar} testID="edit-avatar">
            <View style={styles.avatarBorder}><Avatar uri={avatar} name={fullName} size={88} /></View>
            <View style={styles.avatarEdit}><Icon name="camera" size={16} color={colors.onBrandPrimary} /></View>
          </Pressable>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Full name</Text>
          <Field value={fullName} onChangeText={setFullName} placeholder="Full name" testID="edit-fullname" />
          <Text style={styles.label}>Bio</Text>
          <Field value={bio} onChangeText={setBio} placeholder="Tell your story..." multiline maxLength={160} testID="edit-bio" />
          <Text style={styles.label}>Location</Text>
          <Field value={location} onChangeText={setLocation} placeholder="Location" testID="edit-location" icon={<Icon name="location-outline" size={20} color={colors.muted} />} />
          <Button title="Save changes" onPress={save} loading={saving} testID="edit-save" style={{ marginTop: spacing.lg }} />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: c.onSurface, fontFamily: fonts.display, fontSize: 18 },
  coverWrap: { width: "100%", height: 160 },
  cover: { width: "100%", height: "100%", backgroundColor: c.surfaceTertiary },
  coverScrim: { ...({ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as any) },
  coverEdit: { position: "absolute", bottom: spacing.md, right: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  coverEditText: { color: "#FFFFFF", fontFamily: fonts.medium, fontSize: 13 },
  avatarWrap: { paddingHorizontal: spacing.lg, marginTop: -44 },
  avatarBorder: { padding: 4, borderRadius: 52, backgroundColor: c.surface, alignSelf: "flex-start" },
  avatarEdit: { position: "absolute", bottom: 4, right: 4, width: 30, height: 30, borderRadius: 15, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.surface },
  form: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  label: { color: c.onSurfaceSecondary, fontFamily: fonts.semibold, fontSize: 14, marginTop: spacing.sm },
}));
