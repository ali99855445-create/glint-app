import { Linking, Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
export function normalizeExternalUrl(value:string):string {
 const raw=(value||"").trim();
 if(!raw || /\s/.test(raw))throw new Error("Enter a valid website address");
 if(/^[a-z][a-z0-9+.-]*:/i.test(raw)&&!/^https?:\/\//i.test(raw))throw new Error("Use an http or https website link");
 const url=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`);
 if(!url.hostname.includes(".")||url.username||url.password)throw new Error("Enter a valid website address");
 return url.toString();
}
export async function openExternalLink(value:string){
 const url=normalizeExternalUrl(value);
 try{await Linking.openURL(url);}catch{
  if(Platform.OS==="web")throw new Error("Could not open this website");
  await WebBrowser.openBrowserAsync(url);
 }
}
