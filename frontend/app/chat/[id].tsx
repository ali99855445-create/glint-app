import {ReportModal} from "@/src/components/ReportModal";
import {MessageActions, ActionSheet, SheetAction} from "@/src/components/MessageActions";
import React, { useState } from "react";
import { View, Text, FlatList, Pressable, TextInput, ActivityIndicator, Platform, Alert } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import { useAudioRecorder, RecordingPresets, AudioModule, setAudioModeAsync } from "expo-audio";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { api, uploadFile, fileUrl } from "@/src/api/client";
import { Avatar, UserName } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { VoiceMessage } from "@/src/components/VoiceMessage";
import { useToast } from "@/src/components/Toast";
import { lastSeenText } from "@/src/lib/time";
import { pickAndUploadImage } from "@/src/lib/media";

function Ticks({ status }: { status: string }) {
  const { colors } = useTheme();
  if (status === "read") return <Icon name="checkmark-done" size={14} color={colors.info} />;
  if (status === "delivered") return <Icon name="checkmark-done" size={14} color="rgba(255,255,255,0.7)" />;
  return <Icon name="checkmark" size={14} color="rgba(255,255,255,0.7)" />;
}

export default function ChatDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [selected,setSelected]=useState<any>(null);
  const [reply,setReply]=useState<any>(null);
  const [search,setSearch]=useState("");
  const [searchOpen,setSearchOpen]=useState(false);
  const [reportOpen,setReportOpen]=useState(false);
  const [menu, setMenu] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recStart, setRecStart] = useState(0);

  const chat = useQuery({ queryKey: ["chat", id], queryFn: () => api.get(`/chat/with/${id}`), refetchInterval: 4000 });
  useFocusEffect(React.useCallback(() => { api.post("/chat/heartbeat").catch(() => {}); }, []));

  const sendMut = useMutation({
    mutationFn: (body: any) => api.post("/chat/send", { to_user: id, ...body, reply_to:reply?.id }),
    onError: (e:any) => toast.show(e.message || "Message could not be sent", "error"),
    onSuccess: () => { setReply(null); chat.refetch(); qc.invalidateQueries({ queryKey: ["conversations"] }); },
  });
  const muteMut = useMutation({
    mutationFn: () => api.post(`/chat/${chat.data?.id}/mute`),
    onSuccess: (d) => { toast.show(d.muted ? "Chat muted" : "Chat unmuted", "success"); setMenu(false); chat.refetch(); },
  });

  function sendText() {
    if (!text.trim()) return;
    const submitted=text.trim();
    sendMut.mutate({ type: "text", text: submitted },{onSuccess:()=>setText(current=>current.trim()===submitted?"":current)});
  }
  async function sendPhoto() {
    try {
      const r = await pickAndUploadImage({ quality: 0.6 });
      if (r?.denied) return toast.show("Photo permission needed", "error");
      if (r?.url) sendMut.mutate({ type: "photo", media: r.url });
    } catch (e: any) { toast.show(e.message || "Upload failed", "error"); }
  }
  async function startRecording() {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) return toast.show("Microphone permission needed", "error");
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync(); recorder.record(); setRecStart(Date.now()); setRecording(true);
    } catch { toast.show("Could not start recording", "error"); }
  }
  async function stopRecording(cancel = false) {
    try {
      await recorder.stop(); setRecording(false);
      const uri = recorder.uri;
      if (cancel || !uri) return;
      const duration = (Date.now() - recStart) / 1000;
      if (duration < 1) return toast.show("Hold longer to record", "info");
      setSending(true);
      const url = await uploadFile(uri, `voice_${Date.now()}.m4a`, "audio/m4a");
      sendMut.mutate({ type: "voice", media: url, duration });
    } catch (e: any) { toast.show(e.message || "Voice upload failed", "error"); }
    finally { setSending(false); }
  }

  const data = chat.data;
  const messages = [...(data?.messages || [])].filter((m:any)=>!searchOpen || !search || (m.text||"").toLowerCase().includes(search.toLowerCase())).reverse();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardRoot} keyboardVerticalOffset={0}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}><Icon name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
          <Pressable style={styles.headerUser} onPress={() => data && router.push(`/user/${data.user.username}`)}>
            <View><Avatar uri={data?.user?.avatar} name={data?.user?.full_name} size={40} />{data?.online && <View style={styles.onlineDot} />}</View>
            <View><UserName name={data?.user?.full_name} verified={data?.user?.verified} badge={data?.user?.verification_badge} size={15} /><Text style={styles.status}>{data?.online ? "Online" : lastSeenText(data?.last_seen)}</Text></View>
          </Pressable>
          <Pressable onPress={() => setMenu((m) => !m)} style={styles.iconBtn}><Icon name="ellipsis-vertical" size={22} color={colors.onSurface} /></Pressable>

        </View>

        <ActionSheet visible={menu} onClose={()=>setMenu(false)} title="Chat options">
          <SheetAction label="View profile" onPress={()=>{setMenu(false);router.push(`/user/${data?.user.username}`);}}/>
          <SheetAction label={data?.muted?"Unmute chat":"Mute chat"} onPress={()=>muteMut.mutate()}/>
          <SheetAction label="Search messages" onPress={()=>{setSearchOpen(v=>!v);setMenu(false);}}/>
          <SheetAction label={data?.chat_blocked?"Unblock messages":"Block messages in this chat"} onPress={()=>Alert.alert(data?.chat_blocked?"Unblock messages?":"Block messages?","This affects messaging only. Profile blocking is separate.",[{text:"Cancel",style:"cancel"},{text:"Confirm",onPress:async()=>{try{await api.post(`/chat/with/${id}/block`,{blocked:!data?.chat_blocked});setMenu(false);chat.refetch();}catch(e:any){toast.show(e.message,"error");}}}])}/>
          <SheetAction label="Report account" onPress={()=>{setMenu(false);setReportOpen(true);}}/>
          <SheetAction label="Clear chat for me" onPress={()=>Alert.alert("Clear chat?","Other participants keep their messages.",[{text:"Cancel",style:"cancel"},{text:"Clear",style:"destructive",onPress:async()=>{try{await api.post(`/chat/${data?.id}/clear`);setMenu(false);chat.refetch();}catch(e:any){toast.show(e.message,"error");}}}])}/>
        </ActionSheet>
        {searchOpen&&<TextInput value={search} onChangeText={setSearch} placeholder="Search messages in this chat" placeholderTextColor={colors.muted} style={[styles.input,{margin:12}]}/>}
        {chat.isError&&<Pressable onPress={()=>chat.refetch()} style={{padding:16}}><Text style={{color:colors.error}}>{(chat.error as Error)?.message || "Could not load chat"}. Tap to retry.</Text></Pressable>}
        {chat.isLoading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View> : (
          <FlatList
            style={styles.list}
            data={messages}
            inverted
            keyboardShouldPersistTaps="handled"
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
            renderItem={({ item }) => <View style={[styles.bubbleRow, item.mine ? styles.rowMine : styles.rowTheirs]}><Pressable onPress={()=>setSelected(item)} onLongPress={()=>setSelected(item)} style={[styles.bubble, item.mine ? styles.bubbleMine : styles.bubbleTheirs]}>{item.forwarded&&<Text style={{color:item.mine?"#fff":colors.muted,fontSize:11}}>Forwarded</Text>}{item.reply_to&&<Text style={{color:item.mine?"#fff":colors.muted,fontSize:11}}>Reply to: {(data?.messages||[]).find((m:any)=>m.id===item.reply_to)?.text || "Message"}</Text>}{item.type === "removed"&&<Text style={{color:item.mine?"#fff":colors.muted,fontStyle:"italic"}}>Message removed</Text>}{item.type === "text" && <Text style={[styles.msgText, { color: item.mine ? colors.onBrandPrimary : colors.onSurface }]}>{item.text}</Text>}{item.type === "photo" && item.media && <Image source={{ uri: fileUrl(item.media) }} style={styles.msgImage} contentFit="cover" />}{item.type === "voice" && item.media && <VoiceMessage uri={item.media} duration={item.duration} mine={item.mine} tint={colors.brandPrimary} />}{item.mine && <View style={styles.tickRow}><Ticks status={item.status} /></View>}</Pressable></View>}
            ListEmptyComponent={<View style={[styles.empty, { transform: [{ scaleY: -1 }] }]}><Icon name="chatbubble-ellipses-outline" size={48} color={colors.muted} /><Text style={styles.emptyText}>Say hi to {data?.user?.full_name?.split(" ")[0]}! 👋</Text></View>}
          />
        )}

        {reply&&<View style={{flexDirection:"row",padding:12,backgroundColor:colors.surfaceSecondary}}><Text numberOfLines={1} style={{flex:1,color:colors.onSurface}}>Replying to: {reply.text || reply.type}</Text><Pressable onPress={()=>setReply(null)}><Text style={{color:colors.brand}}>Cancel</Text></Pressable></View>}
        <ReportModal visible={reportOpen} onClose={()=>setReportOpen(false)} targetType="user" targetId={id!}/>
        <MessageActions message={selected} onClose={()=>setSelected(null)} onChanged={()=>{chat.refetch();qc.invalidateQueries({queryKey:["conversations"]});}} onReply={setReply}/>
        {data?.cannot_message?<View style={{padding:20}}><Text style={{color:colors.muted}}>Messaging is blocked in this chat. You can still view the history.</Text></View>:<View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          {recording ? <View style={styles.recordingRow}><View style={styles.recDot} /><Text style={styles.recText}>Recording... release to send</Text><Pressable onPress={() => stopRecording(true)} style={styles.recCancel}><Icon name="trash" size={20} color={colors.error} /></Pressable><Pressable onPress={() => stopRecording(false)} style={styles.recSend}><Icon name="send" size={18} color={colors.onBrandPrimary} /></Pressable></View> : <><Pressable onPress={sendPhoto} style={styles.mediaBtn}><Icon name="image-outline" size={24} color={colors.brand} /></Pressable><TextInput value={text} onChangeText={setText} placeholder="Message..." placeholderTextColor={colors.muted} style={styles.input} multiline />{text.trim() ? <Pressable onPress={sendText} style={styles.sendBtn}><Icon name="arrow-up" size={20} color={colors.onBrandPrimary} /></Pressable> : <Pressable onLongPress={startRecording} onPress={() => toast.show("Hold to record a voice note", "info")} style={styles.sendBtn} disabled={sending}>{sending ? <ActivityIndicator color={colors.onBrandPrimary} size="small" /> : <Icon name="mic" size={20} color={colors.onBrandPrimary} />}</Pressable>}</>}
        </View>}
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  keyboardRoot: { flex: 1, backgroundColor: c.surface },
  root: { flex: 1, backgroundColor: c.surface },
  list: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerUser: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  onlineDot: { position: "absolute", bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: c.success, borderWidth: 2, borderColor: c.surface },
  status: { color: c.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 1 },
  menu: { position: "absolute", right: spacing.md, top: 56, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingVertical: spacing.xs, minWidth: 160, zIndex: 30, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 10, elevation: 6 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  menuText: { color: c.onSurface, fontFamily: fonts.medium, fontSize: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  bubbleRow: { flexDirection: "row" }, rowMine: { justifyContent: "flex-end" }, rowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: radius.lg, padding: spacing.md },
  bubbleMine: { backgroundColor: c.brandPrimary, borderBottomRightRadius: 4 }, bubbleTheirs: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderBottomLeftRadius: 4 },
  msgText: { fontFamily: fonts.text, fontSize: 15, lineHeight: 21 }, msgImage: { width: 200, height: 200, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary }, tickRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 2 },
  empty: { alignItems: "center", gap: spacing.sm, paddingTop: spacing["3xl"] }, emptyText: { color: c.muted, fontFamily: fonts.text, fontSize: 15 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
  mediaBtn: { width: 42, height: 42, alignItems: "center", justifyContent: "center" }, input: { flex: 1, maxHeight: 120, backgroundColor: c.surfaceTertiary, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, color: c.onSurface, fontFamily: fonts.text, fontSize: 15 }, sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  recordingRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm }, recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.error }, recText: { flex: 1, color: c.onSurface, fontFamily: fonts.medium, fontSize: 14 }, recCancel: { width: 42, height: 42, alignItems: "center", justifyContent: "center" }, recSend: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
}));