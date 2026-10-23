import {useEffect} from 'react';
import {AppState} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {useAuth} from '@/src/context/AuthContext';
import {API,getToken,api} from '@/src/api/client';
export function LiveUpdates(){
  const {user}=useAuth();const qc=useQueryClient();
  useEffect(()=>{
    if(!user)return;
    let disposed=false,socket:WebSocket|undefined,retry:ReturnType<typeof setTimeout>|undefined;
    const refresh=()=>{for(const key of ['notifications','unread-count','conversations','chat','group'])qc.invalidateQueries({queryKey:[key]});};
    const connect=async()=>{
      if(disposed||AppState.currentState!=='active')return;
      const token=await getToken();if(disposed||!token)return;
      socket=new WebSocket(API.replace(/^http/,'ws')+'/live');
      socket.onopen=()=>socket?.send(JSON.stringify({token}));
      socket.onmessage=event=>{try{const msg=JSON.parse(event.data);if(['ready','message','notifications','receipts'].includes(msg.kind))refresh();}catch{}};
      socket.onerror=()=>socket?.close();
      socket.onclose=()=>{if(!disposed&&AppState.currentState==='active')retry=setTimeout(connect,5000);};
    };
    connect();
    const presence=setInterval(()=>{if(AppState.currentState==='active')api.post('/chat/heartbeat').catch(()=>{});},45000);
    const sub=AppState.addEventListener('change',state=>{clearTimeout(retry);if(state==='active'){refresh();if(!socket||socket.readyState>1)connect();}else socket?.close();});
    return()=>{disposed=true;clearInterval(presence);clearTimeout(retry);sub.remove();socket?.close();};
  },[user?.id,qc]);
  return null;
}
