import { api } from "@/src/api/client";

export type GroupManagement = {
  is_owner: boolean;
  is_admin: boolean;
  can_edit_group: boolean;
  can_manage_members: boolean;
  can_change_privacy: boolean;
  can_delete_group: boolean;
  privacy: "private" | "public";
};

export async function getGroupManagement(groupId: string): Promise<GroupManagement> {
  return api.get(`/chat/group/${groupId}/management`);
}

export async function setGroupPrivacy(groupId: string, privacy: "private" | "public") {
  return api.post(`/chat/group/${groupId}/privacy`, { privacy });
}

export async function removeGroupMember(groupId: string, userId: string) {
  return api.post(`/chat/group/${groupId}/members/remove`, { user_id: userId });
}

export async function setGroupAdmin(groupId: string, userId: string, admin: boolean) {
  return api.post(`/chat/group/${groupId}/admins`, { user_id: userId, admin });
}

export async function deleteGroup(groupId: string) {
  return api.del(`/chat/group/${groupId}`);
}
