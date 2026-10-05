import {afterEach,describe,expect,it,vi} from "vitest";
import {mkdtemp,readFile,readdir,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import sharp from "sharp";
import {storePendingSponsorLogo,reviewPendingSponsorLogo,readSponsorLogoAsset} from "./sponsor-logo-store";
let root:string|undefined;
afterEach(async()=>{vi.unstubAllEnvs();if(root)await rm(root,{recursive:true,force:true});});
describe("pending sponsor storage",()=>{
 it("keeps a private normalized file and provenance, limits retries",async()=>{
  root=await mkdtemp(join(tmpdir(),"bw-sponsor-test-"));vi.stubEnv("BITCOINWALK_MEDIA_ROOT",root);
  const bytes=await sharp({create:{width:64,height:64,channels:4,background:"white"}}).png().toBuffer();
  const input={bytes,mime:"image/png",cityId:"00000000-0000-4000-8000-000000000001",sponsorPubkey:"a".repeat(64),actor:"a".repeat(64),signedRequestId:"b".repeat(64)};
  const result=await storePendingSponsorLogo(input);expect(result.status).toBe("pending");
  const directory=join(root,"sponsor-pending",input.cityId,input.sponsorPubkey);
  expect((await readdir(directory)).sort()).toEqual(["logo.png","pending.json"]);
  expect(JSON.parse(await readFile(join(directory,"pending.json"),"utf8"))).toMatchObject({signedRequestId:input.signedRequestId,status:"pending",hash:result.hash});
  expect(await readSponsorLogoAsset(result.hash)).toBeNull();
  const reviewed=await reviewPendingSponsorLogo(input.cityId,input.sponsorPubkey);
  expect(reviewed.hash).toBe(result.hash);
  expect(await readSponsorLogoAsset(reviewed.hash)).toEqual(Buffer.from(reviewed.base64,"base64"));
  expect(JSON.parse(await readFile(join(directory,"pending.json"),"utf8"))).toMatchObject({status:"pending"});
  await expect(storePendingSponsorLogo(input)).rejects.toThrow("one minute");
 });
});
