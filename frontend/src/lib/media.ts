import * as ImagePicker from "expo-image-picker";
import { uploadFile } from "@/src/api/client";

export async function pickAndUploadImage(opts?: { aspect?: [number, number]; quality?: number }): Promise<
  { url: string; denied?: boolean } | null
> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { url: "", denied: true };
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: opts?.quality ?? 0.6 });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const name = asset.fileName || `photo_${Date.now()}.jpg`;
  const type = asset.mimeType || "image/jpeg";
  const url = await uploadFile(asset.uri, name, type);
  return { url };
}

/** Blue-only Story helper. Duration is checked before upload and again by the backend. */
export async function pickAndUploadStoryVideo(maxSeconds = 60): Promise<
  { url: string; duration: number; denied?: boolean; tooLong?: boolean } | null
> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { url: "", duration: 0, denied: true };
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    allowsEditing: false,
    videoMaxDuration: maxSeconds,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const duration = Math.max(0, (asset.duration || 0) / 1000);
  if (duration <= 0 || duration > maxSeconds) return { url: "", duration, tooLong: true };
  const name = asset.fileName || `story_${Date.now()}.mp4`;
  const type = asset.mimeType || "video/mp4";
  const url = await uploadFile(asset.uri, name, type);
  return { url, duration };
}

export async function takeAndUploadCameraPhoto(
  purpose: "document_front" | "document_back" | "selfie" = "selfie",
  quality = 0.75,
): Promise<{ url: string; denied?: boolean } | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { url: "", denied: true };
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: false, quality });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const extension = asset.mimeType === "image/png" ? "png" : "jpg";
  const name = `${purpose}_${Date.now()}.${extension}`;
  const type = asset.mimeType || "image/jpeg";
  const url = await uploadFile(asset.uri, name, type);
  return { url };
}

export async function takeAndUploadSelfie(quality = 0.7): Promise<
  { url: string; denied?: boolean } | null
> {
  return takeAndUploadCameraPhoto("selfie", quality);
}
