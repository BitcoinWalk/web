"use client";
import type {Event} from "nostr-tools";
import {mediaRequestTemplate} from "../domain/media-request";
import {signWithBrowserExtension} from "../nostr/signer";
export type MediaAlert={id:string;cityId:string;actor:string;sourceUrl:string;internalUrl?:string;contentHash?:string;storedAt:string;checkedAt:string;status:"failed"|"missing"|"corrupt";error?:string};
export type ReplicationStatus={version:1;state:"healthy"|"pending"|"degraded";reconciled:boolean;cities:Array<{cityId:string;destination:string;state:"healthy"|"pending"|"degraded";counts:Record<string,number>}>};
export const ACCEPTED_IMAGE_TYPES=["image/jpeg","image/png","image/webp"] as const;
export const MAX_IMAGE_UPLOAD_BYTES=5*1024*1024;
async function signedPost<T>(path:string,request:Parameters<typeof mediaRequestTemplate>[0]):Promise<T>{const event=await signWithBrowserExtension(mediaRequestTemplate(request));const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:event as Event})});const text=await response.text();let body:Record<string,unknown>={};try{body=text?JSON.parse(text):{};}catch{throw new Error(`Media service returned HTTP ${response.status} with an invalid response.`);}if(!response.ok)throw new Error(typeof body.error==="string"?body.error:`Media service returned HTTP ${response.status}.`);return body as T;}
export async function importCityImageURL(cityId:string,sourceUrl:string):Promise<{url:string;hash:string}>{return signedPost("/api/media/import",{action:"import-city-image",cityId,sourceUrl});}
export function assertAcceptedImageFile(file:Pick<File,"type"|"size">):asserts file is Pick<File,"type"|"size">&{type:typeof ACCEPTED_IMAGE_TYPES[number]}{
 if(!ACCEPTED_IMAGE_TYPES.includes(file.type as typeof ACCEPTED_IMAGE_TYPES[number])||file.size<1||file.size>MAX_IMAGE_UPLOAD_BYTES)throw new Error("Choose a non-empty JPEG, PNG or WebP image up to 5 MB.");
}
export function isManagedImageURL(value:string):boolean{return /^https:\/\/(?:app-staging\.)?bitcoinwalk\.org\/api\/media\/files\/[a-f0-9]{64}\.webp$/.test(value);}
async function uploadImage(action:"upload-city-image"|"upload-walk-image",cityId:string,file:File):Promise<{url:string;hash:string}>{
 assertAcceptedImageFile(file);
 const bytes=await file.arrayBuffer(),sha256=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(value=>value.toString(16).padStart(2,"0")).join("");
 const event=await signWithBrowserExtension(mediaRequestTemplate({action,cityId,sha256,mime:file.type,bytes:file.size}));
 const form=new FormData();form.set("event",JSON.stringify(event as Event));form.set("file",file);
 const response=await fetch("/api/media/upload",{method:"POST",body:form,signal:AbortSignal.timeout(30000)}),text=await response.text();let body:{url?:string;hash?:string;error?:string};try{body=text?JSON.parse(text):{};}catch{throw new Error(`Media service returned HTTP ${response.status} with an invalid response.`);}if(!response.ok||!body.url||!body.hash)throw new Error(body.error||"Image upload failed.");
 const url=new URL(body.url,window.location.origin);if(url.origin!==window.location.origin||!/^\/api\/media\/files\/[a-f0-9]{64}\.webp$/.test(url.pathname))throw new Error("Image storage returned an invalid URL.");return {url:url.href,hash:body.hash};
}
export async function uploadCityImage(cityId:string,file:File):Promise<{url:string;hash:string}>{return uploadImage("upload-city-image",cityId,file);}
export async function uploadWalkImage(cityId:string,file:File):Promise<{url:string;hash:string}>{return uploadImage("upload-walk-image",cityId,file);}
export async function generateCityImage(cityId:string,cityRevisionId:string):Promise<{url:string;hash:string;model:string}>{return signedPost("/api/media/generate",{action:"generate-city-image",cityId,cityRevisionId});}
export async function prepareCityLogos(cityId:string,revisionId:string,slug:string):Promise<{status:"ready";jobKey:string;files:number}>{return signedPost("/api/city-logos/prepare",{action:"prepare-city-logo",cityId,revisionId,slug});}
export type CityActivationCheck={status:"green"|"amber"|"red"|"na";message:string;url?:string};
export type CityActivationChecks={
  logos:CityActivationCheck;og:CityActivationCheck;meta:CityActivationCheck;
  payment:CityActivationCheck;paymentAuthorization:CityActivationCheck;
  nip05:CityActivationCheck;lnurl:CityActivationCheck;relay:CityActivationCheck;
  walkieTalkie:CityActivationCheck;community:CityActivationCheck;
};
export type CityActivationResult={cityId:string;revisionId:string;checks:CityActivationChecks};
export function cityActivationFinished(checks:CityActivationChecks):boolean{return Object.values(checks).every(check=>check.status==="green"||check.status==="na");}
export async function completeCityActivation(event:Event):Promise<CityActivationResult>{for(let attempt=0;attempt<5;attempt++){const response=await fetch("/api/admin/city-activation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event})}),body=await response.json();if(response.ok)return body;if(response.status!==409||attempt===4)throw new Error(body.error||"City activation checks failed.");await new Promise(resolve=>setTimeout(resolve,1000));}throw new Error("City activation checks failed.");}
export async function mediaAlerts():Promise<{alerts:MediaAlert[];checkedAt:string}>{return signedPost("/api/media/alerts",{action:"list-media-alerts"});}
export async function replicationStatus():Promise<{report:ReplicationStatus;checkedAt:string}>{return signedPost("/api/replication/status",{action:"list-replication-status"});}
