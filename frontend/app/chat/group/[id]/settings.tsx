import {pickAndUploadImage} from "@/src/lib/media";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import React, {useState, useEffect} from "react";
import { Alert, ActivityIndicator, Pressable, ScrollView, Text, View, TextInput } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api/client";
import { Avatar } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { deleteGroup, getGroupManagement, removeGroupMember, setGroupAdmin, setGroupPrivacy } from "@/src/api/groupManagement";

export default function GroupSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets=useSafeAreaInsets();
  const [name,setName]=useState("");
  const [description,setDescription]=useState("");
  const [q,setQ]=useState("");
  const [adding,setAdding]=useState(false);

  const group = useQuery({ queryKey: ["group", id], queryFn: () => api.get(`/chat/group/${id}`) });
  const management = useQuery({ queryKey: ["group-management", id], queryFn: () => getGroupManagement(id!) });

  const people=useQuery({queryKey:["add-group-people",q],queryFn:()=>api.get('/users/search?q='+encodeURIComponent(q)),enabled:adding&&q.trim().length>1});
  useEffect(()=>{if(group.data){setName(group.data.name||'');setDescription(group.data.description||'');}},[group.data?.name,group.data?.description]);
  async function act(path:string,body:any={}){try{await api.post(path,body);await refresh();toast.show('Updated','success');}catch(e:any){toast.show(e.message,'error');}}
  const refresh = async () => {
    await Promise.all([group.refetch(), management.refetch()]);
    qc.invalidateQueries({ queryKey: ["conversations"] });
  };

  const privacyMut = useMutation({ mutationFn: (privacy: "private" | "public") => setGroupPrivacy(id!, privacy), onSuccess: async () => { await refresh(); toast.show("Group privacy updated", "success"); }, onError: (e: any) => toast.show(e.message || "Could not update privacy", "error") });
  const memberMut = useMutation({ mutationFn: (userId: string) => removeGroupMember(id!, userId), onSuccess: async () => { await refresh(); toast.show("Member removed", "success"); }, onError: (e: any) => toast.show(e.message || "Could not remove member", "error") });
  const adminMut = useMutation({ mutationFn: ({ userId, admin }: { userId: string; admin: boolean }) => setGroupAdmin(id!, userId, admin), onSuccess: async () => { await refresh(); toast.show("Admin role updated", "success"); }, onError: (e: any) => toast.show(e.message || "Could not update admin", "error") });
  const deleteMut = useMutation({ mutationFn: () => deleteGroup(id!), onSuccess: () => { qc.invalidateQueries({ queryKey: ["conversations"] }); toast.show("Group deleted", "success"); router.replace("/chat"); }, onError: (e: any) => toast.show(e.message || "Could not delete group", "error") });

  if (group.isLoading || management.isLoading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;
  if (group.isError || management.isError) return <View style={styles.center}><Text style={styles.muted}>Unable to load group settings.</Text></View>;

  const g = group.data;
  const m = management.data!;
  const admins: string[] = g?.admins || [];

  return <ScrollView style={styles.root} contentContainerStyle={[styles.content,{paddingTop:insets.top,paddingBottom:insets.bottom+32}]}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.icon}><Icon name="chevron-back" size={26} color={colors.onSurface} /></Pressable><Text style={styles.title}>Group settings</Text><View style={styles.icon} /></View>

    <View style={styles.card}><Avatar uri={g?.avatar} name={g?.name} size={72}/><Text style={styles.section}>{g?.name}</Text><Text style={styles.muted}>{g?.description||'No group description'} · {g?.member_count} members</Text>
    {m.can_edit_group&&<><TextInput value={name} onChangeText={setName} placeholder="Group name" style={{color:colors.onSurface,padding:12,borderWidth:1,borderColor:colors.border,marginTop:12}}/><TextInput value={description} onChangeText={setDescription} placeholder="Description" multiline style={{color:colors.onSurface,padding:12,borderWidth:1,borderColor:colors.border,marginTop:12}}/><Pressable style={styles.smallButton} onPress={()=>act(`/chat/group/${id}/settings`,{name,description})}><Text style={styles.smallButtonText}>Save group details</Text></Pressable><Pressable style={{paddingVertical:16}} onPress={async()=>{try{const photo=await pickAndUploadImage({quality:.7});if(photo?.url)await act(`/chat/group/${id}/settings`,{avatar:photo.url});}catch(e:any){toast.show(e.message,'error');}}}><Text style={{color:colors.brand}}>Change group photo</Text></Pressable>
    <Text style={styles.section}>Who can send messages?</Text>{['everyone','admins'].map(p=><Pressable key={p} onPress={()=>act(`/chat/group/${id}/settings`,{send_permission:p})} style={{padding:12}}><Text style={{color:(g?.send_permission||'everyone')===p?colors.brand:colors.onSurface}}>{p==='everyone'?'All members':'Admins only'}{(g?.send_permission||'everyone')===p?' ✓':''}</Text></Pressable>)}</>}
    <Pressable style={{paddingVertical:14}} onPress={()=>act(`/chat/${id}/mute`)}><Text style={{color:colors.brand}}>{g?.muted?'Unmute notifications':'Mute notifications'}</Text></Pressable></View>
    {m.can_manage_members&&<View style={styles.card}><Pressable onPress={()=>setAdding(v=>!v)}><Text style={{color:colors.brand,fontSize:16}}>Add members</Text></Pressable>{adding&&<><TextInput value={q} onChangeText={setQ} placeholder="Search people" style={{color:colors.onSurface,padding:12}}/>{(people.data||[]).filter((u:any)=>!(g?.members||[]).some((x:any)=>x.id===u.id)).map((u:any)=><Pressable key={u.id} style={{padding:12}} onPress={()=>act(`/chat/group/${id}/members/add`,{user_id:u.id})}><Text style={{color:colors.onSurface}}>Add {u.full_name}</Text></Pressable>)}</>}</View>}
    <View style={styles.card}>
      <Text style={styles.section}>Privacy</Text>
      <Text style={styles.muted}>Set the group privacy label. Membership is required to read messages. Only admins can change this setting.</Text>
      <View style={styles.rowGap}>{(["private", "public"] as const).map((p) => <Pressable key={p} disabled={!m.can_change_privacy || privacyMut.isPending} onPress={() => privacyMut.mutate(p)} style={[styles.choice, m.privacy === p && styles.choiceActive]}><Icon name={p === "private" ? "lock-closed" : "earth"} size={18} color={m.privacy === p ? colors.onBrandPrimary : colors.onSurface} /><Text style={[styles.choiceText, m.privacy === p && { color: colors.onBrandPrimary }]}>{p === "private" ? "Private" : "Public"}</Text></Pressable>)}</View>
    </View>

    <View style={styles.card}>
      <Text style={styles.section}>Members</Text>
      {(g?.members || []).map((user: any) => {
        const owner = user.id === g?.created_by;
        const admin = owner || admins.includes(user.id);
        return <View key={user.id} style={styles.member}><Avatar uri={user.avatar} name={user.full_name} size={42} /><View style={{ flex: 1 }}><Text style={styles.name}>{user.full_name}</Text><Text style={styles.muted}>{owner ? "Owner" : admin ? "Admin" : "Member"}</Text></View>{m.is_owner && !owner && <Pressable style={{padding:8}} onPress={()=>Alert.alert("Transfer ownership?",`Make ${user.full_name} the group owner?`,[{text:"Cancel",style:"cancel"},{text:"Transfer",onPress:()=>act(`/chat/group/${id}/owner`,{user_id:user.id})}])}><Text style={{color:colors.brand,fontSize:11}}>Make owner</Text></Pressable>}{m.is_owner && !owner && <Pressable style={styles.smallButton} onPress={() => adminMut.mutate({ userId: user.id, admin: !admin })}><Text style={styles.smallButtonText}>{admin ? "Remove admin" : "Make admin"}</Text></Pressable>}{m.can_manage_members && !owner && <Pressable style={styles.remove} onPress={() => Alert.alert("Remove member?", `Remove ${user.full_name} from this group?`, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => memberMut.mutate(user.id) }])}><Icon name="person-remove" size={20} color={colors.error} /></Pressable>}</View>;
      })}
    </View>

    {!m.is_owner&&<View style={styles.card}><Pressable onPress={()=>Alert.alert('Leave group?','You will no longer receive group messages.',[{text:'Cancel',style:'cancel'},{text:'Leave',style:'destructive',onPress:async()=>{try{await api.post(`/chat/group/${id}/leave`);qc.invalidateQueries({queryKey:['conversations']});router.replace('/chat');}catch(e:any){toast.show(e.message,'error');}}}])}><Text style={{color:colors.error}}>Leave group</Text></Pressable></View>}
    {m.can_delete_group && <View style={styles.card}><Text style={styles.section}>Owner controls</Text><Pressable disabled={deleteMut.isPending} style={styles.deleteButton} onPress={() => Alert.alert("Delete group?", "This removes the group from normal user access. This action cannot be undone from the app.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate() }])}>{deleteMut.isPending ? <ActivityIndicator color={colors.error} /> : <><Icon name="trash" size={20} color={colors.error} /><Text style={styles.deleteText}>Delete group</Text></>}</Pressable></View>}
  </ScrollView>;
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface }, content: { paddingBottom: spacing["3xl"] }, center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.surface }, header: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border }, icon: { width: 42, height: 42, alignItems: "center", justifyContent: "center" }, title: { flex: 1, textAlign: "center", color: c.onSurface, fontFamily: fonts.semibold, fontSize: 18 }, card: { margin: spacing.md, marginBottom: 0, padding: spacing.lg, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border }, section: { color: c.onSurface, fontFamily: fonts.semibold, fontSize: 17, marginBottom: spacing.sm }, muted: { color: c.muted, fontFamily: fonts.text, fontSize: 13 }, rowGap: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }, choice: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderWidth: 1, borderColor: c.border, padding: spacing.md, borderRadius: radius.md }, choiceActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary }, choiceText: { color: c.onSurface, fontFamily: fonts.medium }, member: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border }, name: { color: c.onSurface, fontFamily: fonts.medium, fontSize: 14 }, smallButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: c.border }, smallButtonText: { color: c.onSurface, fontFamily: fonts.medium, fontSize: 11 }, remove: { width: 36, height: 36, alignItems: "center", justifyContent: "center" }, deleteButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1, borderColor: c.error, borderRadius: radius.md, padding: spacing.md }, deleteText: { color: c.error, fontFamily: fonts.semibold, fontSize: 15 },
}));