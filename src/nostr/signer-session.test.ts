import {afterEach,describe,expect,it,vi} from "vitest";
import {activeSignerIdentity,connectBrowserSigner,disconnectSignerSession,installSignerSession} from "./signer-session";
import type {NostrBrowserExtension} from "./signer";

const first="1".repeat(64),second="2".repeat(64);
const signer=(pubkey:string):NostrBrowserExtension=>({getPublicKey:async()=>pubkey,signEvent:vi.fn() as never});

describe("shared signer session",()=>{
  afterEach(async()=>{await disconnectSignerSession();vi.unstubAllGlobals();});

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
});
