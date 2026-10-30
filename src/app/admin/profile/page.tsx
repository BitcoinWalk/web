"use client";

import {useEffect,useState} from "react";
import {useDashboard} from "../../../components/dashboard-context";
import NostrUser from "../../../components/nostr-user";
import CitySignerSetup from "../../../components/city-signer-setup";
import {signWithBrowserExtension,getBrowserExtensionPubkey} from "../../../nostr/signer";
import {proSetupTemplate} from "../../../nostr/pro-setup-command";
import type {ProSetupPreview} from "../../../server/pro-setup";
import styles from "./profile.module.css";
import {saveDefaultCity} from "../../../nostr/default-city";
import {useDefaultCity} from "../../../components/use-default-city";

export function CityProfile({cityId,actor}:{cityId:string;actor:string}){
 const [preview,setPreview]=useState<ProSetupPreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function read(){
  const event=await signWithBrowserExtension(proSetupTemplate({action:"preview",cityId},window.location.origin));
  if(event.pubkey!==actor)throw new Error("Account changed. Reconnect your organizer account.");
  const response=await fetch("/api/pro-setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),signal:AbortSignal.timeout(60000)});
  const body=await response.json() as {preview?:ProSetupPreview;error?:string};
  if(!response.ok||!body.preview)throw new Error(body.error||"City profile could not be checked.");
  if(body.preview.cityId!==cityId||await getBrowserExtensionPubkey()!==actor)throw new Error("Account or city changed. Check the profile again.");
  return body.preview;
 }
 async function load(){setBusy(true);setError("");setPreview(null);try{setPreview(await read());}catch(e){setError(e instanceof Error?e.message:"Profile check failed.");}finally{setBusy(false);}}
 const ready=preview?.activation?.status==="active"&&preview.signer.configured&&!!preview.profile.nip05&&!!preview.profile.lud16;
 const setupHref=`/admin/my-cities?city=${encodeURIComponent(cityId)}#pro-city-services`;
 return <section className={styles.panel} id="city-profile" aria-labelledby="city-profile-title">
  <h2 id="city-profile-title">Nostr addresses{preview?` · ${preview.cityName}`:""}</h2>
  <p>Use your BitcoinWalk addresses on Nostr without editing your profile in another app.</p>
  <div className={styles.addresses}>
   <label className={styles.selector}>NIP-05 · verified public address<input readOnly value={preview?.profile.nip05??""} placeholder="Check verified addresses to load your NIP-05" /></label>
   <label className={styles.selector}>LNURL · public Lightning address<input readOnly value={preview?.profile.lud16??""} placeholder="Check verified addresses to load your Lightning address" /></label>
  </div>
  <p className={styles.hint}>These city addresses are assigned by BitcoinWalk and verified before publishing. They are not your private payout wallet.</p>
  <button type="button" disabled={busy} onClick={()=>void load()}>{busy?"Checking city services…":"Check verified addresses"}</button>
  <p className={styles.hint}>This asks your organizer signer to approve a private status check. Nothing is published.</p>
  {error&&<p role="alert">{error}</p>}
  {preview&&<>
   <dl className={styles.addresses}>
    <div><dt>Private organizer payout wallet</dt><dd>{preview.payout.destination||"Not configured"}</dd></div>
   </dl>
   <aside className={styles.split}><strong>79% to your organizer wallet · 21% to BitcoinWalk</strong><p>This split applies to zaps sent to the public BitcoinWalk Lightning address. Zaps sent directly to another wallet bypass it. Publishing your profile does not send funds or change your payout wallet.</p></aside>
   <p><a href={setupHref}>Manage payout wallet and Pro services →</a></p>
   {ready?<CitySignerSetup cityId={cityId} cityName={preview.cityName} actor={actor} saved={preview.signer} setupReady profile={preview.profile} profileOnly busy={busy} onSaved={()=>{}} onActivation={()=>{}} refreshProfile={async()=>{
    const current=await read();
    if(current.activation?.status!=="active"||current.signer.pubkey!==preview.signer.pubkey||current.profile.nip05!==preview.profile.nip05||current.profile.lud16!==preview.profile.lud16)throw new Error("City setup changed. Check verified addresses again before publishing.");
    return current.profile;
   }}/>:<p role="status">Finish city activation in Pro services first. Publishing stays unavailable until both public addresses and the saved city identity are verified.</p>}
  </>}
 </section>;
}

export default function ProfilePage(){
 const dashboard=useDashboard();
 return <ProfileAccount key={dashboard.pubkey} />;
}
function ProfileAccount(){
 const dashboard=useDashboard(),defaultCity=useDefaultCity(dashboard.pubkey),[cityId,setCityId]=useState(""),[saveStatus,setSaveStatus]=useState(""),[saving,setSaving]=useState(false);
 useEffect(()=>{let active=true;const requested=new URLSearchParams(window.location.search).get("city");queueMicrotask(()=>{if(active)setCityId(requested??(defaultCity||dashboard.cities[0]?.id||""));});return()=>{active=false;};},[dashboard.cities,defaultCity]);
 async function selectCity(nextCityId:string){
  if(saving||!dashboard.cities.some(city=>city.id===nextCityId))return;
  const previousCityId=cityId,previousUrl=window.location.href;
  setCityId(nextCityId);setSaving(true);setSaveStatus("Saving default city… Approve your signer if asked.");
  window.history.replaceState(null,"",`/admin/profile?city=${encodeURIComponent(nextCityId)}#city-profile`);
  try{await saveDefaultCity(dashboard.pubkey,nextCityId);setSaveStatus("Default city saved across devices.");}
  catch(e){setCityId(previousCityId);window.history.replaceState(null,"",previousUrl);setSaveStatus(`Could not confirm the save. Choose the city again to retry. ${e instanceof Error?e.message:""}`);}
  finally{setSaving(false);}
 }
 const allowed=dashboard.cities.some(city=>city.id===cityId);
 return <main className={styles.page}><header><h1>Profile</h1><p>Your connected account and the city identities you manage are separate.</p></header>
  <details className={styles.panel}><summary>Your connected account</summary>{dashboard.pubkey?<NostrUser pubkey={dashboard.pubkey}/>:<p>Connect your organizer account first.</p>}<p>Publishing a city profile uses its saved signer, not a different personal identity.</p></details>
  {dashboard.cities.length>0?<><label className={styles.selector}>Your default city<select disabled={saving} aria-describedby="default-city-help default-city-status" value={allowed?cityId:""} onChange={event=>void selectCity(event.target.value)}><option value="" disabled>Choose a city</option>{dashboard.cities.map(city=><option key={city.id} value={city.id}>{city.name}</option>)}</select></label><p id="default-city-help">Saves automatically across devices. This is your starting city for chat and Walkie Talkie walks. Explicit city links still open the city you chose.</p><p id="default-city-status" role="status">{saveStatus}</p>{allowed?<CityProfile key={`${dashboard.pubkey}:${cityId}`} cityId={cityId} actor={dashboard.pubkey}/>:<p role="alert">This city is not available to the connected account. Choose a city you manage.</p>}</>:<p>No managed cities are available for this account.</p>}
 </main>;
}
