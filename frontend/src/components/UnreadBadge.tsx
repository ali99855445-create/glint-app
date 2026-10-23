import React from 'react';
import {View,Text} from 'react-native';
export function UnreadBadge({count}:{count:number}){
  if(!count||count<0)return null;
  return <View accessibilityLabel={`${count} unread`} style={{position:'absolute',right:-11,top:-8,backgroundColor:'#D92D20',minWidth:19,height:19,borderRadius:10,paddingHorizontal:4,alignItems:'center',justifyContent:'center',borderWidth:1.5,borderColor:'#fff'}}><Text style={{color:'#fff',fontSize:10,fontWeight:'700'}}>{count>99?'99+':count}</Text></View>;
}
