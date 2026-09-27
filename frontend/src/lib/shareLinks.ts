import Constants from "expo-constants";

const configuredBase = ((Constants.expoConfig?.extra as any)?.publicShareBaseUrl as string) || "";
const fallbackBase = ((Constants.expoConfig?.extra as any)?.productionApiUrl as string) || "https://glint-api-xf2i.onrender.com";

export const SHARE_BASE_URL = (configuredBase || fallbackBase).replace(/\/$/, "");

export function profileShareUrl(username: string) {
  return `${SHARE_BASE_URL}/share/profile/${encodeURIComponent(username)}`;
}

export function postShareUrl(postId: string) {
  return `${SHARE_BASE_URL}/share/post/${encodeURIComponent(postId)}`;
}

export function storyShareUrl(userId: string, storyId: string) {
  return `${SHARE_BASE_URL}/share/story/${encodeURIComponent(userId)}?storyId=${encodeURIComponent(storyId)}`;
}

export function appShareUrl() {
  return `${SHARE_BASE_URL}/share/app`;
}
