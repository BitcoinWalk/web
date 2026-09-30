"use client";

import type {NostrBrowserExtension} from "./signer";
import {validOrganizerKey} from "./organizer-identity";

type RemoteSession={close:()=>Promise<void>};
type Listener=(pubkey:string|null)=>void;
let identity:string|null=null,originalSigner:NostrBrowserExtension|undefined,originalCaptured=false,custom=false,remote:RemoteSession|null=null;
const listeners=new Set<Listener>();
function announce(){for(const listener of listeners)listener(identity);}
async function clearCustom(){if(remote){await remote.close();remote=null;}if(custom&&typeof window!=="undefined")window.nostr=originalSigner;custom=false;originalSigner=undefined;originalCaptured=false;}
export function activeSignerIdentity(){return identity;}
export function subscribeSignerSession(listener:Listener){listeners.add(listener);return()=>listeners.delete(listener);}
export async function connectBrowserSigner(){await clearCustom();if(typeof window==="undefined"||!window.nostr)throw new Error("A Nostr browser extension is required.");identity=validOrganizerKey(await window.nostr.getPublicKey());announce();return identity;}
export async function installSignerSession(signer:NostrBrowserExtension,remoteSession:RemoteSession|null=null){const key=validOrganizerKey(await signer.getPublicKey());await clearCustom();if(!originalCaptured){originalSigner=typeof window!=="undefined"?window.nostr:undefined;originalCaptured=true;}window.nostr=signer;custom=true;remote=remoteSession;identity=key;announce();return key;}
export async function disconnectSignerSession(){await clearCustom();identity=null;announce();}
