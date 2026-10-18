import {afterEach,describe,it,expect,vi} from "vitest";
import {finalizeEvent,getPublicKey,type EventTemplate} from "nostr-tools";
import {decryptWithBrowserExtension,setDashboardSigningIdentity,signWithBrowserExtension} from "./signer";
const secret=new Uint8Array(32).fill(7),key=getPublicKey(secret),other=getPublicKey(new Uint8Array(32).fill(8));
const template:EventTemplate={kind:1,created_at:1,tags:[],content:"test"};
afterEach(()=>{setDashboardSigningIdentity(null);vi.unstubAllGlobals();});
describe("dashboard signer identity binding",()=>{
 it("refuses signing if the extension switched accounts",async()=>{const sign=vi.fn();vi.stubGlobal("window",{nostr:{getPublicKey:async()=>other,signEvent:sign}});setDashboardSigningIdentity(key);await expect(signWithBrowserExtension(template)).rejects.toThrow("Signer identity changed");expect(sign).not.toHaveBeenCalled();});
 it("rejects an in-flight signature after dashboard disconnect",async()=>{vi.stubGlobal("window",{nostr:{getPublicKey:async()=>key,signEvent:async()=>{setDashboardSigningIdentity(null);return finalizeEvent(template,secret);}}});setDashboardSigningIdentity(key);await expect(signWithBrowserExtension(template)).rejects.toThrow("Dashboard identity changed");});
 it("allows the connected identity to sign",async()=>{vi.stubGlobal("window",{nostr:{getPublicKey:async()=>key,signEvent:async()=>finalizeEvent(template,secret)}});setDashboardSigningIdentity(key);expect((await signWithBrowserExtension(template)).pubkey).toBe(key);});
 it("opens NIP-44 plaintext only with the connected identity",async()=>{const decrypt=vi.fn(async()=>"private message");vi.stubGlobal("window",{nostr:{getPublicKey:async()=>key,signEvent:vi.fn(),nip44:{encrypt:vi.fn(),decrypt}}});setDashboardSigningIdentity(key);await expect(decryptWithBrowserExtension(other,"ciphertext")).resolves.toBe("private message");expect(decrypt).toHaveBeenCalledWith(other,"ciphertext");});
 it("rejects an account change while decrypting",async()=>{vi.stubGlobal("window",{nostr:{getPublicKey:async()=>key,signEvent:vi.fn(),nip44:{encrypt:vi.fn(),decrypt:async()=>{setDashboardSigningIdentity(other);return "private message";}}}});setDashboardSigningIdentity(key);await expect(decryptWithBrowserExtension(other,"ciphertext")).rejects.toThrow("Dashboard identity changed");});
});
