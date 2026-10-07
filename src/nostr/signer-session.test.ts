import {afterEach,describe,expect,it,vi} from "vitest";
import {finalizeEvent,generateSecretKey,getPublicKey} from "nostr-tools";
import {activeSignerIdentity,connectBrowserSigner,disconnectSignerSession,installSignerSession} from "./signer-session";
import {setDashboardSigningIdentity,signWithBrowserExtension,type NostrBrowserExtension} from "./signer";

const first="1".repeat(64),second="2".repeat(64);
const signer=(pubkey:string):NostrBrowserExtension=>({getPublicKey:async()=>pubkey,signEvent:vi.fn() as never});

describe("shared signer session",()=>{
  afterEach(async()=>{setDashboardSigningIdentity(null);await disconnectSignerSession();vi.unstubAllGlobals();});

  it("keeps a selected signer available and restores the browser signer on disconnect",async()=>{
    const browserSigner=signer(first),temporarySigner=signer(second);
    vi.stubGlobal("window",{nostr:browserSigner});
    await connectBrowserSigner();
    expect(activeSignerIdentity()).toBe(first);
    await installSignerSession(temporarySigner);
    expect(window.nostr).toBe(temporarySigner);
    expect(activeSignerIdentity()).toBe(second);
    await disconnectSignerSession();
    expect(window.nostr).toBe(browserSigner);
    expect(activeSignerIdentity()).toBeNull();
  });

  it("routes a kind 30309 directory signature through an installed NIP-46-compatible signer adapter",async()=>{
    const secret=generateSecretKey(),pubkey=getPublicKey(secret),template={kind:30309,created_at:1,tags:[],content:"successor"},remoteSigner:NostrBrowserExtension={getPublicKey:async()=>pubkey,signEvent:vi.fn(async event=>finalizeEvent(event,secret))};
    vi.stubGlobal("window",{});await installSignerSession(remoteSigner);setDashboardSigningIdentity(pubkey);
    const signed=await signWithBrowserExtension(template);
    expect(signed.pubkey).toBe(pubkey);expect(remoteSigner.signEvent).toHaveBeenCalledWith(template);
  });
});
