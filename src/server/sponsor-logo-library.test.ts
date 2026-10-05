import {afterEach,expect,it,vi} from "vitest";
import {mkdtemp,readdir,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";
import {storePendingSponsorLogo,listSponsorLogoUploads,previewSponsorLogo} from "./sponsor-logo-store";
let root:string;
afterEach(async()=>{vi.unstubAllEnvs();if(root)await rm(root,{recursive:true,force:true});});
it("lists provenance and previews privately without staging or approving artwork",async()=>{
 root=await mkdtemp(join(tmpdir(),"bw-library-"));vi.stubEnv("BITCOINWALK_MEDIA_ROOT",root);
 const cityId="00000000-0000-4000-8000-000000000001",sponsorPubkey="a".repeat(64);
 const record=await storePendingSponsorLogo({cityId,sponsorPubkey,actor:sponsorPubkey,signedRequestId:"b".repeat(64),mime:"image/png",bytes:await sharp({create:{width:64,height:64,channels:4,background:"white"}}).png().toBuffer()});
 expect(await listSponsorLogoUploads()).toEqual([expect.objectContaining({cityId,sponsorPubkey,hash:record.hash})]);
 expect(await previewSponsorLogo({cityId,sponsorPubkey,hash:record.hash})).toMatchObject({hash:record.hash,base64:expect.any(String)});
 expect(await readdir(root)).toEqual(["sponsor-pending"]);
 await writeFile(join(root,"sponsor-pending",cityId,sponsorPubkey,"logo.png"),"corrupt");
 await expect(previewSponsorLogo({cityId,sponsorPubkey,hash:record.hash})).rejects.toThrow();
});
it("rejects traversal identities",async()=>{await expect(previewSponsorLogo({cityId:"../",sponsorPubkey:"a".repeat(64),hash:"b".repeat(64)})).rejects.toThrow();});
