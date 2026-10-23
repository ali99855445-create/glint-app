import { LiveSelfieCapture } from "@/src/components/LiveSelfieCapture";
import { useEffect, useState, useRef } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { Field, Button } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { Avatar, BlueTick } from "@/src/components/Avatar";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { api, fileUrl } from "@/src/api/client";
import { pickAndUploadImage } from "@/src/lib/media";

import { IdentityVideo } from "@/src/components/IdentityVideo";
import { useIAP, getAvailablePurchases } from "expo-iap";
import { createBillingErrorReporter, selectBlueOffer, planBlueCheckout, availableBlueProduct } from "@/src/lib/blue-billing";

const BLUE_BENEFITS=[
  ["checkmark-circle","Blue badge everywhere","Your Blue Tick appears across supported Glint surfaces."],
  ["shield-checkmark","Impersonation protection","Priority review for reports about accounts pretending to be you."],
  ["videocam","60-second video Stories","Post video Stories up to 60 seconds; Stories expire after 24 hours."],
  ["help-buoy","Priority Glint support","Get priority access to Glint support for account issues."],
  ["link","Two external social links","Add up to two external social links to your profile."],
];

export default function Verification() {
  const [captureVisible,setCaptureVisible]=useState(false);
  const styles=useStyles(); const {colors}=useTheme(); const insets=useSafeAreaInsets(); const router=useRouter(); const toast=useToast(); const {user,refresh}=useAuth();
  const status=useQuery({queryKey:["verification",user?.id],queryFn:()=>api.get("/verification/me")});
  useFocusEffect(React.useCallback(()=>{status.refetch();},[]));
  const [buying,setBuying]=useState(false);
  const billing=useQuery({queryKey:["blue-billing-config",user?.id],queryFn:()=>api.get("/blue/billing-config")});
  const paymentBusy=useRef(false);
  const [checkoutProductId,setCheckoutProductId]=useState<string|undefined>();
  const [inventoryError,setInventoryError]=useState<string|null>(null);
  const catalog: string[]=billing.data?.product_ids|| (billing.data?.product_id?[billing.data.product_id]:[]);
  const catalogKey=catalog.join(',');
  const reportBillingError=useRef(createBillingErrorReporter(message=>toast.show(message,"error"))).current;
  const iap=useIAP({
    onPurchaseSuccess: async purchase => {
      const isPass=Boolean(billing.data?.pass_product_ids?.includes(purchase.productId));
      if(!catalog.includes(purchase.productId)&&!isPass)return;
      try {
        if(purchase.purchaseState === "pending"){toast.show("Your Google Play payment is pending.","error");return;}
        if(!purchase.purchaseToken)throw new Error("Google Play did not return a purchase token");
        if(isPass){await api.post("/blue/passes/verify",{purchase_token:purchase.purchaseToken,product_id:purchase.productId});}
        else{await api.post("/blue/purchases/verify",{purchase_token:purchase.purchaseToken});await iap.finishTransaction({purchase,isConsumable:false});}
        const refreshed=await status.refetch();
        await refresh();
        await billing.refetch();
        toast.show(refreshed.data?.blue_active?"Your Blue subscription is active.":"Payment confirmed. Complete your identity review.","success");
      }catch(e:any){reportBillingError(e);}
      finally{paymentBusy.current=false;setBuying(false);}
    },
    onPurchaseError: error => {paymentBusy.current=false;setBuying(false);reportBillingError(error);},
  });
  useEffect(()=>{
    let current=true;setCheckoutProductId(undefined);setInventoryError(null);
    if(iap.connected&&catalog.length){
      iap.fetchProducts({skus:catalog,type:"subs"}).catch(()=>{if(current)setInventoryError("Google Play pricing is unavailable.");});
      getAvailablePurchases().then(owned=>{if(current)setCheckoutProductId(availableBlueProduct(catalog,owned));})
        .catch(()=>{if(current)setInventoryError("Could not check existing Google Play subscriptions. Reopen this screen to retry.");});
    }
    return ()=>{current=false;};
  },[iap.connected,catalogKey,user?.id]);
  const [legalName,setLegalName]=useState(""); const [note,setNote]=useState(""); const [doc,setDoc]=useState<string|null>(null); const [selfie,setSelfie]=useState<string|null>(null); const [submitting,setSubmitting]=useState(false);
  const current=status.data?.blue_active?"approved":status.data?.status;
  const product=iap.subscriptions.find(p=>p.id===checkoutProductId);
  const basePlanId=(checkoutProductId&&billing.data?.base_plan_ids?.[checkoutProductId])||billing.data?.base_plan_id||"monthly";
  const offers=product?.subscriptionOffers||[];
  const baseOffer=selectBlueOffer(offers,false,undefined,basePlanId);
  const selectedOffer=selectBlueOffer(offers,Boolean(billing.data?.intro_eligible),billing.data?.intro_offer_id,basePlanId);
  const phases=selectedOffer?.pricingPhasesAndroid?.pricingPhaseList||[];
  const intro=selectedOffer?.id===billing.data?.intro_offer_id;
  const regularPrice=phases[phases.length-1]?.formattedPrice || baseOffer?.displayPrice || product?.displayPrice;
  const firstPrice=phases[0]?.formattedPrice || selectedOffer?.displayPrice;
  const price=intro&&firstPrice ? `${firstPrice} for first month` : regularPrice ? `${regularPrice}/month` : "Price available from Google Play";
  const paymentConfirmed=Boolean(status.data?.blue_payment_confirmed||status.data?.payment_confirmed||status.data?.subscription_paid);
  const showIdentity=paymentConfirmed||Boolean(status.data?.blue_active);

  async function uploadDoc(){try{const r=await pickAndUploadImage({quality:.75});if(r?.denied)return toast.show("Photo permission needed","error");if(r?.url)setDoc(r.url);}catch(e:any){toast.show(e.message||"Upload failed","error")}}
  function captureSelfie(){setCaptureVisible(true)}
  async function reconcileSubscriptions(ids: string[]){
    return planBlueCheckout(ids,await getAvailablePurchases(),async purchase=>{
      await api.post("/blue/purchases/verify",{purchase_token:purchase.purchaseToken});
      await iap.finishTransaction({purchase,isConsumable:false});
      await status.refetch();await refresh();await billing.refetch();
    });
  }
  async function continueToPayment(){
    if(paymentBusy.current)return;
    if(Platform.OS!=="android")return toast.show("Subscribe through the Glint Android app on Google Play","error");
    if(!iap.connected||!product||!billing.data)return toast.show("Subscription is not available in Google Play yet","error");
    paymentBusy.current=true;setBuying(true);
    try{
      const fresh=await billing.refetch();
      if(fresh.error)throw fresh.error;
      if(!fresh.data?.checkout_ready)throw new Error("Payments are not available yet. Please try again later.");
      // Includes cancelled subscriptions until their paid period expires.
      const freshCatalog: string[]=fresh.data.product_ids||[fresh.data.product_id];
      const plan=await reconcileSubscriptions(freshCatalog);
      if(plan.restored){
        toast.show("Existing subscription restored. No new payment was taken.","success");
        paymentBusy.current=false;setBuying(false);return;
      }
      if(!plan.productId)throw new Error("All configured Glint subscription products are in use on this Google Play account. Contact support; no new payment was taken.");
      if(plan.productId!==checkoutProductId){setCheckoutProductId(plan.productId);throw new Error("Your available subscription changed. Review the updated price and tap Continue again.");}
      const freshBasePlanId=fresh.data.base_plan_ids?.[plan.productId]||fresh.data.base_plan_id||"monthly";
      const offer=selectBlueOffer(offers,Boolean(fresh.data.intro_eligible),fresh.data.intro_offer_id,freshBasePlanId);
      if(fresh.data.intro_eligible&&!offer)throw new Error("Your first-month offer is not available in Google Play yet. No payment was taken.");
      if(offer?.offerTokenAndroid!==selectedOffer?.offerTokenAndroid)throw new Error("Your offer changed. Check the updated price and tap Continue again.");
      if(!offer?.offerTokenAndroid)throw new Error("Monthly subscription plan is not available yet. Reopen this screen to refresh Google Play pricing.");
      if(!fresh.data.account_id)throw new Error("Could not identify your Glint account. Reopen this screen and try again.");
      await iap.requestPurchase({type:"subs",request:{google:{skus:[plan.productId],subscriptionOffers:[{sku:plan.productId,offerToken:offer.offerTokenAndroid}],obfuscatedAccountId:fresh.data.account_id}}});
    }catch(e:any){paymentBusy.current=false;setBuying(false);reportBillingError(e);}
  }
  async function restorePayment(){
    if(paymentBusy.current||!iap.connected)return;
    paymentBusy.current=true;setBuying(true);
    try{
      // Recover unsettled legacy v23 payments, but never launch a new pass purchase.
      const owned=await getAvailablePurchases();
      let recoveredPass=false;
      for(const purchase of owned.filter(p=>billing.data?.pass_product_ids?.includes(p.productId))){
        if(purchase.purchaseState==='pending')throw new Error("Your previous payment is pending in Google Play.");
        await api.post("/blue/passes/verify",{purchase_token:purchase.purchaseToken,product_id:purchase.productId});
        recoveredPass=true;
      }
      if(recoveredPass){await status.refetch();await refresh();await billing.refetch();toast.show("Previous monthly pass restored. It does not auto-renew.","success");return;}
      if(!billing.data?.product_id)throw new Error("Subscription details are not ready. Please try again.");
      const result=await reconcileSubscriptions(catalog);
      const restored=result.restored;
      toast.show(restored?"Subscription restored":"No active Glint Blue subscription found",restored?"success":"error");
    }catch(e:any){reportBillingError(e);}finally{paymentBusy.current=false;setBuying(false);}
  }
  async function submit(){if(!legalName.trim())return toast.show("Enter your full legal name","error");if(legalName.trim().toLocaleLowerCase().replace(/\s+/g," ")!==(user?.full_name||"").trim().toLocaleLowerCase().replace(/\s+/g," "))return toast.show("Your profile name must match the full name on your ID","error");if(!doc)return toast.show("Upload an ID document","error");if(!selfie)return toast.show("Record a live selfie video","error");setSubmitting(true);try{await api.post("/verification",{document:doc,selfie,full_legal_name:legalName.trim(),note:note.trim()||null});toast.show("Your request is under review by the Glint Team. We aim to notify you within 24–48 hours.","success");status.refetch();}catch(e:any){toast.show(e.message,"error");}finally{setSubmitting(false)}}
  const StatusBanner=()=>{if(current==="pending")return <Banner icon="hourglass-outline" color={colors.warning} title="Under review" text="Your request is under review by the Glint Team. We aim to review your document and live selfie video and notify you of the outcome within 24–48 hours."/>;if(current==="approved"&&!status.data?.blue_active)return <Banner icon="refresh-circle" color={colors.warning} title="Subscription inactive" text="Renew or restore your subscription to reactivate your approved Blue Tick."/>;if(current==="approved")return <Banner icon="checkmark-circle" color="#1877F2" title="You're verified!" text="Your Blue Tick and Blue benefits are active."/>;if(current==="rejected")return <Banner icon="close-circle" color={colors.error} title="Request declined" text="Your last verification request was declined."/>;return null};

  return <View style={[styles.root,{paddingTop:insets.top}]}><LiveSelfieCapture visible={captureVisible} onClose={()=>setCaptureVisible(false)} onComplete={setSelfie}/><View style={styles.header}><Pressable onPress={()=>router.back()} style={styles.iconBtn}><Icon name="chevron-back" size={26} color={colors.onSurface}/></Pressable><Text style={styles.title}>Glint Verified</Text><View style={{width:40}}/></View><KeyboardAwareScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" bottomOffset={20}>
    <View style={styles.hero}><View style={styles.profilePreview}><Avatar uri={user?.avatar} name={user?.full_name} size={72}/><View style={{alignItems:"center"}}><View style={styles.nameRow}><Text style={styles.profileName}>{user?.full_name||"Your profile"}</Text><BlueTick size={21}/></View><Text style={styles.previewLabel}>Preview of your Blue Tick</Text></View></View><Text style={styles.heroTitle}>Unlock Blue benefits</Text><Text style={styles.heroText}>Subscribe, confirm your identity, and get access after your verification is approved.</Text></View>
    <StatusBanner/>
    <Text style={styles.small}>Monthly subscriptions renew automatically at the regular Google Play price until cancelled. Existing monthly passes keep their paid access and do not auto-renew.</Text>
    {!showIdentity&&inventoryError&&<Text style={styles.small}>{inventoryError}</Text>}
    {!showIdentity&&!checkoutProductId&&!inventoryError&&<Text style={styles.small}>Checking available Google Play subscriptions. If none becomes available, use Restore purchase or contact support. No new payment is taken.</Text>}
    {!showIdentity&&<><View style={styles.planCard}><View style={styles.planTop}><View><Text style={styles.planName}>Glint Verified</Text><Text style={styles.price}>{price}</Text>{intro&&<Text style={styles.small}>90% off your first month · then {regularPrice}/month. Once per Glint account.</Text>}</View><View style={styles.monthlyPill}><Text style={styles.monthlyText}>Monthly</Text></View></View><Text style={styles.small}>Subscription does not guarantee verification. Your identity must be approved before the Blue Tick and benefits activate.</Text></View><View style={styles.benefitsCard}><Text style={styles.cardTitle}>Your 5 Blue benefits</Text>{BLUE_BENEFITS.map(([icon,title,text])=><View style={styles.benefit} key={title}><View style={styles.benefitIcon}><Icon name={icon as any} size={20} color={colors.brand}/></View><View style={{flex:1}}><Text style={styles.benefitTitle}>{title}</Text><Text style={styles.benefitText}>{text}</Text></View></View>)}</View><Button title={`Continue · ${price}`} onPress={continueToPayment} testID="blue-continue-payment" loading={buying} disabled={!selectedOffer||!billing.data?.checkout_ready}/>{!billing.data?.checkout_ready&&<Text style={styles.small}>Payments are being set up. Pricing is shown for reference.</Text>}<Button title="Restore purchase" variant="ghost" onPress={restorePayment} disabled={!iap.connected||buying}/><Text style={styles.legal}>Payment is processed through Google Play. Your subscription renews monthly at the regular price until cancelled in Google Play. The first-month offer is available once per Glint account. After successful payment, you will submit your ID and live selfie for review.</Text></>}
    {showIdentity&&<><View style={styles.rulesCard}><Text style={styles.cardTitle}>Identity verification</Text><Rule ok={!!legalName.trim()&&legalName.trim().toLocaleLowerCase()===(user?.full_name||"").trim().toLocaleLowerCase()} text="Profile name matches your ID document"/><Rule ok={!!doc} text="Government ID or official document"/><Rule ok={!!selfie} text="Live selfie video recorded in the app"/></View>{current!=="pending"&&current!=="approved"&&<><Text style={styles.small}>Your profile name must match the name on your genuine ID document. The Glint Team will check your document and live selfie video.</Text><Field value={legalName} onChangeText={setLegalName} placeholder="Full legal name" icon={<Icon name="person-outline" size={20} color={colors.muted}/>}/><Pressable style={styles.uploadCard} onPress={uploadDoc}>{doc?<Image source={{uri:fileUrl(doc)}} style={styles.uploadImage} contentFit="cover"/>:<><Icon name="document-text-outline" size={34} color={colors.brand}/><Text style={styles.uploadTitle}>Upload ID document</Text><Text style={styles.uploadSub}>Use a genuine, unaltered identity document belonging to you.</Text></>}</Pressable><Pressable style={styles.uploadCard} onPress={captureSelfie}>{selfie?<Text style={styles.uploadTitle}>Live selfie video recorded ✓ · Tap to record again</Text>:<><Icon name="camera-outline" size={34} color={colors.brand}/><Text style={styles.uploadTitle}>Record live selfie video</Text><Text style={styles.uploadSub}>Record 2–15 seconds: show your face clearly and slowly turn your head.</Text></>}</Pressable>{selfie&&<IdentityVideo url={selfie}/>}<Field value={note} onChangeText={setNote} placeholder="Anything we should know? (optional)" multiline/><Button title="Submit for review" onPress={submit} loading={submitting}/><Text style={styles.legal}>Fake, forged, impersonation or AI-generated identity documents are prohibited. Repeated fraudulent submissions may restrict future verification applications.</Text></>}</>}
  </KeyboardAwareScrollView></View>;
}
function Rule({ok,text}:{ok:boolean;text:string}){const styles=useStyles();const {colors}=useTheme();return <View style={styles.ruleRow}><View style={[styles.ruleIcon,{backgroundColor:ok?colors.brandTertiary:colors.surfaceTertiary}]}><Icon name={ok?"checkmark":"ellipse-outline"} size={16} color={ok?colors.brand:colors.muted}/></View><Text style={styles.ruleText}>{text}</Text></View>}
function Banner({icon,color,title,text}:any){const styles=useStyles();return <View style={[styles.banner,{borderColor:color}]}><Icon name={icon} size={26} color={color}/><View style={{flex:1}}><Text style={[styles.bannerTitle,{color}]}>{title}</Text><Text style={styles.bannerText}>{text}</Text></View></View>}
const useStyles=makeStyles(c=>({root:{flex:1,backgroundColor:c.surface},header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:spacing.lg,paddingVertical:spacing.sm},iconBtn:{width:40,height:40,alignItems:"center",justifyContent:"center"},title:{color:c.onSurface,fontFamily:fonts.display,fontSize:18},body:{padding:spacing.lg,gap:spacing.lg,paddingBottom:spacing["2xl"]},hero:{alignItems:"center",gap:spacing.sm,paddingVertical:spacing.sm},profilePreview:{alignItems:"center",gap:spacing.sm},nameRow:{flexDirection:"row",alignItems:"center",gap:6},profileName:{color:c.onSurface,fontFamily:fonts.displayBold,fontSize:20},previewLabel:{color:c.muted,fontFamily:fonts.text,fontSize:12,marginTop:2},heroTitle:{color:c.onSurface,fontFamily:fonts.displayBold,fontSize:27,textAlign:"center",marginTop:spacing.sm},heroText:{color:c.muted,fontFamily:fonts.text,fontSize:14,textAlign:"center",lineHeight:21,paddingHorizontal:spacing.md},planCard:{backgroundColor:c.surfaceSecondary,borderWidth:1.5,borderColor:c.brand,borderRadius:radius.lg,padding:spacing.lg,gap:spacing.md},planTop:{flexDirection:"row",alignItems:"flex-start",justifyContent:"space-between"},planName:{color:c.onSurface,fontFamily:fonts.displayBold,fontSize:21},price:{color:c.brand,fontFamily:fonts.displayBold,fontSize:19,marginTop:4},monthlyPill:{backgroundColor:c.brandTertiary,borderRadius:radius.pill,paddingHorizontal:spacing.md,paddingVertical:spacing.xs},monthlyText:{color:c.onBrandTertiary,fontFamily:fonts.semibold,fontSize:12},small:{color:c.muted,fontFamily:fonts.text,fontSize:12,lineHeight:18},benefitsCard:{backgroundColor:c.surfaceSecondary,borderWidth:1,borderColor:c.border,borderRadius:radius.lg,padding:spacing.lg,gap:spacing.md},cardTitle:{color:c.onSurface,fontFamily:fonts.displayBold,fontSize:18},benefit:{flexDirection:"row",gap:spacing.md,alignItems:"flex-start"},benefitIcon:{width:38,height:38,borderRadius:19,backgroundColor:c.brandTertiary,alignItems:"center",justifyContent:"center"},benefitTitle:{color:c.onSurface,fontFamily:fonts.semibold,fontSize:15},benefitText:{color:c.muted,fontFamily:fonts.text,fontSize:12,lineHeight:18,marginTop:2},rulesCard:{gap:spacing.md,padding:spacing.lg,backgroundColor:c.surfaceSecondary,borderWidth:1,borderColor:c.border,borderRadius:radius.lg},ruleRow:{flexDirection:"row",alignItems:"center",gap:spacing.sm},ruleIcon:{width:28,height:28,borderRadius:14,alignItems:"center",justifyContent:"center"},ruleText:{flex:1,color:c.onSurfaceSecondary,fontFamily:fonts.medium,fontSize:14},banner:{flexDirection:"row",gap:spacing.md,alignItems:"center",backgroundColor:c.surfaceSecondary,borderWidth:1.5,borderRadius:radius.md,padding:spacing.lg},bannerTitle:{fontFamily:fonts.semibold,fontSize:16},bannerText:{color:c.onSurfaceSecondary,fontFamily:fonts.text,fontSize:14,marginTop:2,lineHeight:20},eligibilityNote:{flexDirection:"row",alignItems:"flex-start",gap:spacing.sm,padding:spacing.md,backgroundColor:c.brandTertiary,borderRadius:radius.md},eligibilityText:{flex:1,color:c.onBrandTertiary,fontFamily:fonts.text,fontSize:13,lineHeight:19},uploadCard:{minHeight:150,borderWidth:1.5,borderStyle:"dashed",borderColor:c.borderStrong,borderRadius:radius.md,alignItems:"center",justifyContent:"center",gap:spacing.xs,backgroundColor:c.surfaceSecondary,overflow:"hidden",padding:spacing.lg},uploadImage:{width:"100%",height:190,borderRadius:radius.sm},uploadTitle:{color:c.onSurface,fontFamily:fonts.semibold,fontSize:15},uploadSub:{color:c.muted,fontFamily:fonts.text,fontSize:13,textAlign:"center",lineHeight:18},legal:{color:c.muted,fontFamily:fonts.text,fontSize:11,lineHeight:17,textAlign:"center",paddingHorizontal:spacing.sm}}));
