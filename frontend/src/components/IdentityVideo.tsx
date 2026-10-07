import { View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { fileUrl } from "@/src/api/client";
export function IdentityVideo({url}:{url:string}) {
 const player=useVideoPlayer(fileUrl(url)||url);
 return <View style={{height:220,width:"100%",borderRadius:12,overflow:"hidden"}}><VideoView player={player} style={{width:"100%",height:"100%"}} nativeControls contentFit="contain"/></View>;
}
