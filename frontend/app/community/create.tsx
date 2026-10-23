import React,{useState} from 'react';
import {View,Text,TextInput,Pressable,ScrollView} from 'react-native';
import {useRouter} from 'expo-router';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {api} from '@/src/api/client';
import {useTheme} from '@/src/theme';
import {Avatar} from '@/src/components/Avatar';
import {Icon} from '@/src/components/Icon';
import {Button} from '@/src/components/ui';
import {useToast} from '@/src/components/Toast';
import {pickAndUploadImage} from '@/src/lib/media';
export default function CreateCommunity(){
 const {colors:c}=useTheme(),router=useRouter(),insets=useSafeAreaInsets(),qc=useQueryClient(),toast=useToast();
 const [name,setName]=useState(''),[description,setDescription]=useState(''),[photo,setPhoto]=useState<string|null>(null),[privacy,setPrivacy]=useState('public'),[uploading,setUploading]=useState(false);
 const create=useMutation({mutationFn:()=>api.post('/communities',{name:name.trim(),description,photo,privacy}),onSuccess:d=>{qc.invalidateQueries({queryKey:['communities']});router.replace(`/community/${d.id}`);},onError:(e:Error)=>toast.show(e.message,'error')});
 const field={padding:14,borderRadius:12,backgroundColor:c.surfaceSecondary,color:c.onSurface};
 async function upload(){setUploading(true);try{const r=await pickAndUploadImage({quality:.75});if(r?.url)setPhoto(r.url);}catch(e:any){toast.show(e.message,'error');}finally{setUploading(false);}}
 return <ScrollView style={{flex:1,backgroundColor:c.surface}} contentContainerStyle={{padding:20,paddingTop:insets.top+12,gap:18,paddingBottom:insets.bottom+24}}><Pressable onPress={()=>router.back()} accessibilityLabel="Back"><Icon name="chevron-back" color={c.onSurface}/></Pressable><Text style={{fontSize:25,fontWeight:'700',color:c.onSurface}}>Create Glint Group</Text><Text style={{color:c.muted}}>A community with posts and members. This is separate from Messenger chats.</Text><Pressable onPress={upload} disabled={uploading} style={{alignItems:'center',gap:8}}><Avatar uri={photo} name={name||'Glint Group'} size={90}/><Text style={{color:c.brand}}>{uploading?'Uploading…':'Add group photo'}</Text></Pressable><TextInput accessibilityLabel="Group name" maxLength={100} placeholder="Group name" placeholderTextColor={c.muted} value={name} onChangeText={setName} style={field}/><TextInput accessibilityLabel="Group description" maxLength={2000} placeholder="What is your community about?" placeholderTextColor={c.muted} value={description} onChangeText={setDescription} multiline style={[field,{minHeight:100}]}/><Text style={{color:c.onSurface,fontWeight:'700'}}>Privacy</Text>{['public','private'].map(p=><Pressable key={p} onPress={()=>setPrivacy(p)} style={{padding:16,borderWidth:1,borderColor:privacy===p?c.brand:c.border,borderRadius:12}}><Text style={{color:c.onSurface,fontWeight:'700'}}>{privacy===p?'●':'○'} {p==='public'?'Public':'Private'}</Text><Text style={{color:c.muted,marginTop:5}}>{p==='public'?'People can view posts and join.':'Only members see posts. Owner approves join requests.'}</Text></Pressable>)}<Button title="Create group" onPress={()=>create.mutate()} disabled={!name.trim()||uploading||create.isPending} loading={create.isPending}/></ScrollView>;
}
