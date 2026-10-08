import React, {useState} from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { api } from "@/src/api/client";
import { Avatar, UserName } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { timeAgo } from "@/src/lib/time";
import { usesNativeTabs } from "@/src/navigation";
import { useFocusEffect } from "expo-router";

export default function ChatList() {
  const styles = useStyles();
  const [search,setSearch]=useState("");
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const convos = useQuery({ queryKey: ["conversations"], queryFn: () => api.get("/chat/conversations"), refetchInterval:5000 });
  useFocusEffect(React.useCallback(() => { convos.refetch(); api.post("/chat/heartbeat").catch(() => {}); }, []));
  return (
    <View style={[styles.root, { paddingTop: 0 }]}>
      <View style={styles.header}><Text style={styles.title}>Messages</Text><Pressable onPress={() => router.push("/chat/new-group")} style={styles.newBtn} testID="chat-new-group"><Icon name="people" size={20} color={colors.onSurface} /></Pressable></View>
      <TextInput value={search} onChangeText={setSearch} placeholder="Search conversations" placeholderTextColor={colors.muted} style={{marginHorizontal:16,padding:14,borderRadius:24,color:colors.onSurface,backgroundColor:colors.surfaceSecondary}}/>
      <Pressable onPress={()=>router.push("/search")} style={{padding:14,margin:16,borderRadius:24,backgroundColor:colors.surfaceSecondary}}><Text style={{color:colors.muted}}>Search people to start a conversation</Text></Pressable>
      {convos.isLoading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View> : (
        <FlatList data={(convos.data || []).filter((v:any)=>(v.is_group?v.name:(v.user.full_name+" "+v.user.username)).toLowerCase().includes(search.toLowerCase()))} keyExtractor={(c) => c.id} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: bottomChrome + 24 }} renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(item.is_group ? `/chat/group/${item.id}` : `/chat/${item.user.id}`)} testID={item.is_group ? `group-${item.id}` : `convo-${item.user.username}`}>
            <View>{item.is_group ? <View style={styles.groupAvatar}><Icon name="people" size={26} color={colors.onBrandPrimary} /></View> : <><Avatar uri={item.user.avatar} name={item.user.full_name} size={56} />{item.online && <View style={styles.onlineDot} />}</>}</View>
            <View style={{ flex: 1 }}><View style={styles.rowTop}>{item.is_group ? <View style={styles.groupNameRow}><Text style={styles.groupName} numberOfLines={1}>{item.name}</Text><Text style={styles.memberCount}>· {item.member_count}</Text></View> : <UserName name={item.user.full_name} verified={Boolean(item.user.blue_tick_active)} size={15} />}<Text style={styles.time}>{timeAgo(item.updated_at)}</Text></View><View style={styles.rowBottom}><Text style={[styles.preview, item.unread > 0 && { color: colors.onSurface, fontFamily: fonts.semibold }]} numberOfLines={1}>{item.last_message || "Say hi 👋"}</Text><View style={styles.rowBottomRight}>{item.muted && <Icon name="notifications-off" size={14} color={colors.muted} />}{item.unread > 0 && <View style={styles.unread}><Text style={styles.unreadText}>{item.unread}</Text></View>}</View></View></View>
          </Pressable>
        )} ListEmptyComponent={<View style={styles.empty}><Icon name="chatbubbles-outline" size={56} color={colors.muted} /><Text style={styles.emptyText}>{search?"No matching conversations. Search people to start a new chat.":"No conversations yet. Search for someone to start chatting!"}</Text></View>} />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({root:{flex:1,backgroundColor:c.surface},header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:spacing.lg,paddingVertical:spacing.sm},title:{color:c.onSurface,fontFamily:fonts.displayBold,fontSize:26},newBtn:{width:42,height:42,borderRadius:21,backgroundColor:c.surfaceSecondary,borderWidth:1,borderColor:c.border,alignItems:"center",justifyContent:"center"},center:{flex:1,alignItems:"center",justifyContent:"center"},row:{flexDirection:"row",alignItems:"center",gap:spacing.md,paddingVertical:spacing.md},onlineDot:{position:"absolute",bottom:2,right:2,width:14,height:14,borderRadius:7,backgroundColor:c.success,borderWidth:2,borderColor:c.surface},groupAvatar:{width:56,height:56,borderRadius:28,backgroundColor:c.brandPrimary,alignItems:"center",justifyContent:"center"},groupNameRow:{flex:1,flexDirection:"row",alignItems:"center",gap:4},groupName:{color:c.onSurface,fontFamily:fonts.semibold,fontSize:15,flexShrink:1},memberCount:{color:c.muted,fontFamily:fonts.text,fontSize:13},rowTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},time:{color:c.muted,fontFamily:fonts.text,fontSize:12},rowBottom:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:3},rowBottomRight:{flexDirection:"row",alignItems:"center",gap:spacing.xs},preview:{flex:1,color:c.muted,fontFamily:fonts.text,fontSize:14,marginRight:spacing.sm},unread:{backgroundColor:c.brandPrimary,minWidth:20,height:20,borderRadius:10,alignItems:"center",justifyContent:"center",paddingHorizontal:6},unreadText:{color:c.onBrandPrimary,fontFamily:fonts.semibold,fontSize:11},empty:{alignItems:"center",gap:spacing.md,paddingTop:spacing["3xl"],paddingHorizontal:spacing.xl},emptyText:{color:c.muted,fontFamily:fonts.text,fontSize:15,textAlign:"center"}}));
