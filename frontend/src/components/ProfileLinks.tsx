import { View, Text, Pressable, Linking, Alert } from "react-native";
import { useTheme, spacing } from "@/src/theme";
export function ProfileLinks({profile}: {profile: any}) {
 const {colors}=useTheme();
 if(!profile?.blue_tick_active)return null;
 return <View style={{gap:spacing.sm,marginTop:spacing.sm}}>{(profile.external_links||[]).slice(0,2).map((link:any)=><Pressable key={link.url} accessibilityRole="link" onPress={async()=>{if(!/^https?:\/\//i.test(link.url))return;try{await Linking.openURL(link.url);}catch{Alert.alert("Unable to open link", "Please try again.");}}}><Text style={{color:colors.info}}>{link.label || link.url} ↗</Text></Pressable>)}</View>;
}
