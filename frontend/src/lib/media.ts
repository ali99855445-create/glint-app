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
  // NOTE: allowsEditing (system crop screen) is intentionally disabled.
  // On many Android devices the system crop UI has no visible Done/Save
  // button, which blocked users from completing image selection entirely.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: opts?.quality ?? 0.6,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const name = asset.fileName || `photo_${Date.now()}.jpg`;
  const type = asset.mimeType || "image/jpeg";
  const url = await uploadFile(asset.uri, name, type);
  return { url };
}

/**
 * Camera-only capture for identity verification evidence.
 * Gallery selection is deliberately unavailable so an applicant must capture
 * the document/selfie during the verification flow.
 */
export async function takeAndUploadCameraPhoto(
  purpose: "document_front" | "document_back" | "selfie" = "selfie",
  quality = 0.75,
): Promise<{ url: string; denied?: boolean } | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    return { url: "", denied: true };
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    quality,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const extension = asset.mimeType === "image/png" ? "png" : "jpg";
  const name = `${purpose}_${Date.now()}.${extension}`;
  const type = asset.mimeType || "image/jpeg";
  const url = await uploadFile(asset.uri, name, type);
  return { url };
}

/**
 * Open the device camera for a fresh selfie, then upload it.
 * Kept as the public selfie helper for existing screens.
 */
export async function takeAndUploadSelfie(quality = 0.7): Promise<
  { url: string; denied?: boolean } | null
> {
  return takeAndUploadCameraPhoto("selfie", quality);
}
