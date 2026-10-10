"use client";
import type {Event} from "nostr-tools";
import {mediaRequestTemplate} from "../domain/media-request";
import {signWithBrowserExtension} from "../nostr/signer";
export type MediaAlert={id:string;cityId:string;actor:string;sourceUrl:string;internalUrl?:string;contentHash?:string;storedAt:string;checkedAt:string;status:"failed"|"missing"|"corrupt";error?:string};
export type ReplicationStatus={version:1;state:"healthy"|"pending"|"degraded";reconciled:boolean;cities:Array<{cityId:string;destination:string;state:"healthy"|"pending"|"degraded";counts:Record<string,number>}>};
async function signedPost<T>(path:string,request:Parameters<typeof mediaRequestTemplate>[0]):Promise<T>{const event=await signWithBrowserExtension(mediaRequestTemplate(request));const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:event as Event})});const text=await response.text();let body:Record<string,unknown>={};try{body=text?JSON.parse(text):{};}catch{throw new Error(`Media service returned HTTP ${response.status} with an invalid response.`);}if(!response.ok)throw new Error(typeof body.error==="string"?body.error:`Media service returned HTTP ${response.status}.`);return body as T;}
export async function importCityImageURL(cityId:string,sourceUrl:string):Promise<{url:string;hash:string}>{return signedPost("/api/media/import",{action:"import-city-image",cityId,sourceUrl});}
export async function generateCityImage(cityId:string,cityRevisionId:string):Promise<{url:string;hash:string;model:string}>{return signedPost("/api/media/generate",{action:"generate-city-image",cityId,cityRevisionId});}
export async function prepareCityLogos(cityId:string,revisionId:string,slug:string):Promise<{status:"ready";jobKey:string;files:number}>{return signedPost("/api/city-logos/prepare",{action:"prepare-city-logo",cityId,revisionId,slug});}
export type CityActivationCheck={status:"green"|"amber"|"red"|"na";message:string;url?:string};
export type CityActivationResult={cityId:string;revisionId:string;checks:{
  logos:CityActivationCheck;og:CityActivationCheck;meta:CityActivationCheck;
  payment:CityActivationCheck;paymentAuthorization:CityActivationCheck;
  nip05:CityActivationCheck;lnurl:CityActivationCheck;relay:CityActivationCheck;
}};
export async function completeCityActivation(event:Event):Promise<CityActivationResult>{for(let attempt=0;attempt<5;attempt++){const response=await fetch("/api/admin/city-activation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event})}),body=await response.json();if(response.ok)return body;if(response.status!==409||attempt===4)throw new Error(body.error||"City activation checks failed.");await new Promise(resolve=>setTimeout(resolve,1000));}throw new Error("City activation checks failed.");}
export async function mediaAlerts():Promise<{alerts:MediaAlert[];checkedAt:string}>{return signedPost("/api/media/alerts",{action:"list-media-alerts"});}
export async function replicationStatus():Promise<{report:ReplicationStatus;checkedAt:string}>{return signedPost("/api/replication/status",{action:"list-replication-status"});}
