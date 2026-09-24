import * as ImagePicker from "expo-image-picker";
import { uploadFile } from "@/src/api/client";

/**
 * Launch the library, let the user pick an image, upload it, return the servable URL.
 * Returns null if cancelled or permission denied.
 */
export async function pickAndUploadImage(opts?: { aspect?: [number, number]; quality?: number }): Promise<
  { url: string; denied?: boolean } | null
> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    return { url: "", denied: true };
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: opts?.aspect,
    quality: opts?.quality ?? 0.6,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const name = asset.fileName || `photo_${Date.now()}.jpg`;
  const type = asset.mimeType || "image/jpeg";
  const url = await uploadFile(asset.uri, name, type);
  return { url };
}
