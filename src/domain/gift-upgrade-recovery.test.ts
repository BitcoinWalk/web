import {describe,expect,it} from "vitest";
import {giftRecoveryTokenFromHash,giftRecoveryURL} from "./gift-upgrade-recovery";
const token="a".repeat(64);
describe("gift upgrade recovery links",()=>{
 it("keeps the private token in the URL fragment",()=>{const url=giftRecoveryURL("https://bitcoinwalk.org/austin/nevent1example?view=walk",token);expect(url).toBe(`https://bitcoinwalk.org/austin/nevent1example?view=walk#bitcoinwalk-upgrade=${token}`);expect(giftRecoveryTokenFromHash(new URL(url).hash)).toBe(token);});
 it.each(["","#bitcoinwalk-upgrade=short","#bitcoinwalk-upgrade="+"A".repeat(64),"#other="+token])("rejects malformed fragments",hash=>expect(giftRecoveryTokenFromHash(hash)).toBeNull());
});
