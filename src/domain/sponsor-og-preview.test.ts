import {describe,expect,it} from "vitest";
import {exactApprovedSponsorAsset,sponsorOgPreviewPath} from "./sponsor-og-preview";
const hash="a".repeat(64),path=`/api/og/files/${hash}.jpg`;
describe("sponsor OG preview",()=>{
  it("activates only the exact reviewed order asset",()=>{
    expect(exactApprovedSponsorAsset({hash},hash)).toBe(hash);
    expect(()=>exactApprovedSponsorAsset({hash:"b".repeat(64)},hash)).toThrow("Uploaded logo changed");
    expect(()=>exactApprovedSponsorAsset({},hash)).toThrow("Uploaded logo changed");
  });
  it("uses the local artifact route, not a server-provided host",()=>{
    expect(sponsorOgPreviewPath({hash,url:`https://bitcoinwalk.org${path}`})).toBe(path);
  });
  it.each([null,{}, {hash,url:"javascript:alert(1)"}, {hash,url:`https://bitcoinwalk.org${path}?x=1`}, {hash,url:`https://bitcoinwalk.org/api/og/files/${"b".repeat(64)}.jpg`}, {hash:"../bad",url:"https://bitcoinwalk.org/"}])("rejects invalid or mismatched artifacts",value=>{
    expect(()=>sponsorOgPreviewPath(value)).toThrow();
  });
});
