import { openExternalLink } from "@/src/lib/externalLinks";
import { View, Text, Pressable, Linking, Alert } from "react-native";
import { useTheme, spacing } from "@/src/theme";
export function ProfileLinks({profile}: {profile: any}) {
 const {colors}=useTheme();
 if(!profile?.blue_tick_active)return null;
 return <View style={{gap:spacing.sm,marginTop:spacing.sm}}>{(profile.external_links||[]).slice(0,2).map((link:any)=><Pressable key={link.url} accessibilityRole="link" onPress={async()=>{try{await openExternalLink(link.url);}catch(e:any){Alert.alert("Unable to open link", e.message||"Please try again.");}}}><Text style={{color:colors.info}}>{link.label || link.url} ↗</Text></Pressable>)}</View>;
}
