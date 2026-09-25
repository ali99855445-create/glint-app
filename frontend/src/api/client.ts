import { Platform } from "react-native";
import Constants from "expo-constants";
import { storage } from "@/src/utils/storage";

// In production builds, the app talks to YOUR own backend (Render),
// configured in app.json -> expo.extra.productionApiUrl.
// In development/preview (__DEV__), it keeps using the Emergent preview backend.
const PROD_BASE = ((Constants.expoConfig?.extra as any)?.productionApiUrl as string) || "";
const BASE = !__DEV__ && PROD_BASE ? PROD_BASE : process.env.EXPO_PUBLIC_BACKEND_URL;
export const API = `${BASE}/api`;

export const TOKEN_KEY = "glint_token";
export const ADMIN_TOKEN_KEY = "glint_admin_token";

let cachedToken: string | null = null;

export async function setToken(token: string | null) {
  cachedToken = token;
  if (token) await storage.secureSet(TOKEN_KEY, token);
  else await storage.secureRemove(TOKEN_KEY);
}

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  const t = await storage.secureGet<string>(TOKEN_KEY, "");
  cachedToken = t || null;
  return cachedToken;
}

async function request(path: string, options: RequestInit = {}, useAdmin = false): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  let token: string | null;
  if (useAdmin) {
    token = await storage.secureGet<string>(ADMIN_TOKEN_KEY, "");
  } else {
    token = await getToken();
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const message = (data && data.detail) || "Something went wrong";
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return data;
}

export const api = {
  get: (p: string, admin = false) => request(p, { method: "GET" }, admin),
  post: (p: string, body?: any, admin = false) =>
    request(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }, admin),
  put: (p: string, body?: any) => request(p, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: (p: string, admin = false) => request(p, { method: "DELETE" }, admin),
};

// admin form-encoded post (for resolve ticket)
export async function adminForm(path: string, form: Record<string, string>): Promise<any> {
  const token = await storage.secureGet<string>(ADMIN_TOKEN_KEY, "");
  const body = new URLSearchParams(form).toString();
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

// Upload a local file (image/audio) and return the servable URL with token.
// Native release builds use FileSystem.uploadAsync (native OkHttp/NSURLSession stack)
// because fetch+FormData file uploads can silently fail in production APKs.
export async function uploadFile(uri: string, name = "upload.jpg", type = "image/jpeg"): Promise<string> {
  const token = await getToken();
  const url = `${API}/upload`;

  if (Platform.OS === "web") {
    const form = new FormData();
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
    const res = await fetch(url, {
      method: "POST",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.detail || `Upload failed (HTTP ${res.status})`);
    return `${API}/files/${data.path}?token=${data.token}`;
  }

  const FileSystem = await import("expo-file-system/legacy");
  const result = await FileSystem.uploadAsync(url, uri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: "file",
    mimeType: type,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  let data: any = null;
  try {
    data = result.body ? JSON.parse(result.body) : null;
  } catch {
    data = null;
  }
  if (result.status < 200 || result.status >= 300) {
    throw new Error(data?.detail || `Upload failed (HTTP ${result.status}). Check your connection and try again.`);
  }
  if (!data?.path || !data?.token) throw new Error("Upload failed: bad server response");
  return `${API}/files/${data.path}?token=${data.token}`;
}

// Turn a stored /api/files path into a full URL (already absolute in our case)
export function fileUrl(pathOrUrl: string | null | undefined): string | undefined {
  if (!pathOrUrl) return undefined;
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  return `${API}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}
