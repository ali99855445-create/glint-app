import {useCallback,useEffect,useState} from 'react';
import {AppState} from 'react-native';
import {useFocusEffect} from 'expo-router';
/** A mounted chat behind another screen must never mark messages read. */
export function useActiveScreen(){
 const [focused,setFocused]=useState(false),[foreground,setForeground]=useState(AppState.currentState==='active');
 useFocusEffect(useCallback(()=>{setFocused(true);return()=>setFocused(false);},[]));
 useEffect(()=>{const sub=AppState.addEventListener('change',state=>setForeground(state==='active'));return()=>sub.remove();},[]);
 return focused&&foreground;
}
