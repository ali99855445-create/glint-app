import React,{useState} from 'react';
import {View,Text,Pressable,FlatList,ActivityIndicator,Alert} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useInfiniteQuery,useQuery,useQueryClient} from '@tanstack/react-query';
import {api} from '@/src/api/client';
import {useTheme} from '@/src/theme';
import {Avatar} from '@/src/components/Avatar';
import {Icon} from '@/src/components/Icon';
import {useToast} from '@/src/components/Toast';
export default function CommunityMembers(){
 const {id}=useLocalSearchParams<{id:string}>(),{colors:c}=useTheme(),router=useRouter(),insets=useSafeAreaInsets(),qc=useQueryClient(),toast=useToast();
 const [tab,setTab]=useState('active'),[busy,setBusy]=useState(false);
 const group=useQuery({queryKey:['community',id],queryFn:()=>api.get(`/communities/${id}`)});
 const owner=group.data?.is_owner;
 const members=useInfiniteQuery({queryKey:['community-members',id,tab],initialPageParam:'',enabled:tab!=='friends',queryFn:({pageParam})=>api.get(`/communities/${id}/members?status=${tab}`+(pageParam?'&before='+pageParam:'')),getNextPageParam:(p:any)=>p.next||undefined});
 const friends=useQuery({queryKey:['friends'],enabled:!!owner&&tab==='friends',queryFn:()=>api.get('/friends')});
 async function change(uid:string,remove=false){if(busy)return;setBusy(true);try{if(remove)await api.del(`/communities/${id}/members/${uid}`);else await api.post(`/communities/${id}/members`,{user_id:uid});qc.invalidateQueries({queryKey:['community-members',id]});qc.invalidateQueries({queryKey:['community',id]});qc.invalidateQueries({queryKey:['communities']});toast.show(remove?'Member removed':'Member added','success');}catch(e:any){toast.show(e.message,'error');}finally{setBusy(false);}}
 const rows=tab==='friends'?(friends.data||[]):members.data?.pages.flatMap(p=>p.items)||[];
 return <View style={{flex:1,paddingTop:insets.top,backgroundColor:c.surface}}><View style={{flexDirection:'row',gap:16,padding:16}}><Pressable onPress={()=>router.back()}><Icon name="chevron-back" color={c.onSurface}/></Pressable><Text style={{fontWeight:'700',fontSize:20,color:c.onSurface}}>Community members</Text></View><View style={{flexDirection:'row',padding:12,gap:16}}>{(owner?['active','pending','friends']:['active']).map(t=><Pressable key={t} onPress={()=>setTab(t)}><Text style={{color:tab===t?c.brand:c.muted,fontWeight:'700'}}>{t==='active'?'Members':t==='pending'?'Requests':'Add friends'}</Text></Pressable>)}</View>{(tab==='friends'?friends.isError:members.isError)&&<Pressable onPress={()=>tab==='friends'?friends.refetch():members.refetch()}><Text style={{padding:16,color:c.error}}>Unable to load. Tap to retry.</Text></Pressable>}{(tab==='friends'?friends.isLoading:members.isLoading)&&<ActivityIndicator color={c.brand}/>}<FlatList data={rows} keyExtractor={u=>u.id} onEndReached={()=>{if(tab!=='friends'&&members.hasNextPage&&!members.isFetchingNextPage)members.fetchNextPage();}} contentContainerStyle={{paddingBottom:insets.bottom+20}} renderItem={({item:u})=><View style={{flexDirection:'row',alignItems:'center',gap:12,padding:16,borderBottomWidth:1,borderColor:c.border}}><Avatar uri={u.avatar} name={u.full_name} size={44}/><Pressable style={{flex:1}} onPress={()=>router.push(`/user/${u.username}`)}><Text style={{color:c.onSurface,fontWeight:'700'}}>{u.full_name}</Text><Text style={{color:c.muted}}>@{u.username}{u.id===group.data?.owner_id?' · Owner':''}</Text></Pressable>{owner&&u.id!==group.data?.owner_id&&<Pressable disabled={busy} onPress={()=>tab==='active'?Alert.alert('Remove member?','They will need the owner to add them again.',[{text:'Cancel'},{text:'Remove',onPress:()=>change(u.id,true)}]):change(u.id)}><Text style={{color:tab==='active'?c.error:c.brand}}>{tab==='active'?'Remove':tab==='pending'?'Approve':'Add'}</Text></Pressable>}</View>} ListEmptyComponent={<Text style={{padding:24,color:c.muted,textAlign:'center'}}>No {tab==='pending'?'join requests':tab==='friends'?'friends to add':'members'} to show.</Text>}/></View>;
}
