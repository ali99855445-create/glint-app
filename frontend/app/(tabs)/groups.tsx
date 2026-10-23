import React from 'react';
import {View,Text,Pressable,FlatList,ActivityIndicator} from 'react-native';
import {useRouter} from 'expo-router';
import {useInfiniteQuery} from '@tanstack/react-query';
import {api} from '@/src/api/client';
import {useTheme} from '@/src/theme';
import {Avatar} from '@/src/components/Avatar';
import {Icon} from '@/src/components/Icon';
export default function Communities(){
 const {colors:c}=useTheme(),router=useRouter();
 const groups=useInfiniteQuery({queryKey:['communities'],initialPageParam:'',queryFn:({pageParam})=>api.get('/communities'+(pageParam?'?before='+encodeURIComponent(pageParam):'')),getNextPageParam:(page:any)=>page.next||undefined});
 return <View style={{flex:1,backgroundColor:c.surface}}><View style={{padding:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><View><Text style={{fontSize:24,fontWeight:'700',color:c.onSurface}}>Glint Groups</Text><Text style={{color:c.muted,marginTop:4}}>Communities, posts and people</Text></View><Pressable accessibilityLabel="Create community group" onPress={()=>router.push('/community/create')}><Icon name="add-circle" color={c.brand} size={34}/></Pressable></View>
 {groups.isLoading&&<ActivityIndicator color={c.brand}/>}{groups.isError&&<Pressable onPress={()=>groups.refetch()} style={{padding:16}}><Text style={{color:c.error}}>Groups could not load. Tap to retry.</Text></Pressable>}
 <FlatList data={groups.data?.pages.flatMap(p=>p.items)||[]} keyExtractor={g=>g.id} refreshing={groups.isRefetching} onRefresh={()=>groups.refetch()} onEndReached={()=>{if(groups.hasNextPage&&!groups.isFetchingNextPage)groups.fetchNextPage();}} renderItem={({item:g})=><Pressable onPress={()=>router.push(`/community/${g.id}`)} style={{padding:16,flexDirection:'row',gap:12,borderBottomWidth:1,borderColor:c.border}}><Avatar uri={g.photo} name={g.name} size={64}/><View style={{flex:1}}><Text style={{fontWeight:'700',fontSize:17,color:c.onSurface}}>{g.name}</Text><Text style={{color:c.muted,marginTop:4}}>{g.privacy==='private'?'Private':'Public'} · {g.member_count} members{g.membership==='active'?' · Joined':g.membership==='pending'?' · Requested':''}</Text><Text numberOfLines={2} style={{color:c.onSurface,marginTop:4}}>{g.description}</Text></View><Icon name="chevron-forward" color={c.muted}/></Pressable>} ListEmptyComponent={!groups.isLoading&&!groups.isError?<View style={{padding:30,alignItems:'center',gap:12}}><Icon name="people-circle-outline" size={58} color={c.brand}/><Text style={{color:c.onSurface,fontSize:18}}>Create the first Glint community</Text><Text style={{color:c.muted,textAlign:'center'}}>Share posts and photos with your members. Messenger group chats stay in Messenger.</Text></View>:null} ListFooterComponent={groups.isFetchingNextPage?<ActivityIndicator color={c.brand}/>:null}/></View>;
}
