import { useEffect,useRef,useState } from "react";
import { Modal,View,Text,Pressable,ActivityIndicator,Linking } from "react-native";
import { CameraView,useCameraPermissions,useMicrophonePermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { uploadFile } from "@/src/api/client";
import { Button } from "@/src/components/ui";
import { useTheme,fonts,spacing } from "@/src/theme";

export function LiveSelfieCapture({visible,onClose,onComplete}:{visible:boolean;onClose:()=>void;onComplete:(url:string)=>void}){
 const {colors}=useTheme(),insets=useSafeAreaInsets();
 const camera=useRef<CameraView>(null),cancelled=useRef(false),recordingRef=useRef(false);
 const [cameraPermission,requestCamera]=useCameraPermissions(),[micPermission,requestMic]=useMicrophonePermissions();
 const [ready,setReady]=useState(false),[recording,setRecording]=useState(false),[uploading,setUploading]=useState(false),[seconds,setSeconds]=useState(0),[error,setError]=useState("");
 const permitted=!!cameraPermission?.granted&&!!micPermission?.granted;
 useEffect(()=>{if(visible){cancelled.current=false;setReady(false);setError("");setSeconds(0);}else{cancelled.current=true;camera.current?.stopRecording();}},[visible]);
 useEffect(()=>{if(!recording)return;const timer=setInterval(()=>setSeconds(v=>v+1),1000);return()=>clearInterval(timer);},[recording]);
 useEffect(()=>()=>{cancelled.current=true;camera.current?.stopRecording();},[]);
 async function permissions(){try{const c=await requestCamera();if(c.granted)await requestMic();}catch{setError("Could not request camera permissions. Please try again.");}}
 function close(){cancelled.current=true;if(recordingRef.current)camera.current?.stopRecording();onClose();}
 async function record(){
  if(!ready||!camera.current||recordingRef.current||uploading)return;
  setError("");setSeconds(0);setRecording(true);recordingRef.current=true;const started=Date.now();
  try{
   const video=await camera.current.recordAsync({maxDuration:15,maxFileSize:10*1024*1024});
   if(cancelled.current)return;
   if(!video?.uri||Date.now()-started<2000)throw new Error("Record at least two seconds. Show your face and slowly turn your head.");
   setRecording(false);setUploading(true);
   const url=await uploadFile(video.uri,`live_selfie_${Date.now()}.mp4`,"video/mp4");
   if(!cancelled.current){onComplete(url);onClose();}
  }catch(e:any){if(!cancelled.current)setError(e.message||"Could not record or upload the video. Please try again.");}
  finally{recordingRef.current=false;setRecording(false);setUploading(false);}
 }
 return <Modal visible={visible} animationType="slide" onRequestClose={close}><View style={{flex:1,backgroundColor:colors.surface,paddingTop:insets.top,paddingBottom:insets.bottom}}><View style={{padding:spacing.lg,gap:spacing.sm}}><Pressable onPress={close} disabled={uploading}><Text style={{color:colors.brand,fontFamily:fonts.semibold}}>Close</Text></Pressable><Text style={{color:colors.onSurface,fontFamily:fonts.display,fontSize:21}}>Record live selfie video</Text><Text style={{color:colors.onSurfaceSecondary,fontFamily:fonts.text,lineHeight:21}}>Show your face clearly and slowly turn your head. Record 2–15 seconds. The Glint Team will compare this video with your ID document.</Text></View>{permitted?<CameraView ref={camera} style={{flex:1}} facing="front" mode="video" videoQuality="480p" videoBitrate={1500000} onCameraReady={()=>setReady(true)} onMountError={e=>setError(e.message)} />:<View style={{flex:1,justifyContent:"center",padding:spacing.lg,gap:spacing.md}}><Text style={{color:colors.onSurfaceSecondary}}>Camera and microphone permissions are required to record your selfie video.</Text><Button title="Continue" onPress={permissions}/>{(cameraPermission?.canAskAgain===false||micPermission?.canAskAgain===false)&&<Button title="Open phone settings" variant="ghost" onPress={()=>Linking.openSettings()}/>}</View>}<View style={{padding:spacing.lg,gap:spacing.md}}>{!!error&&<Text style={{color:colors.error}}>{error}</Text>}{uploading?<><ActivityIndicator color={colors.brand}/><Text style={{color:colors.onSurface,textAlign:"center"}}>Uploading selfie video…</Text></>:permitted&&<Button title={recording?`Stop recording · ${seconds}s`:"Start recording"} onPress={recording?()=>camera.current?.stopRecording():record} disabled={!ready}/>}</View></View></Modal>;
}
