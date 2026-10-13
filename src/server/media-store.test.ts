import {afterEach,describe,expect,it,vi} from "vitest";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import sharp from "sharp";
vi.mock("server-only",()=>({}));
import {readMedia,storeChatImage} from "./media-store";

let root:string|undefined;
afterEach(async()=>{vi.unstubAllEnvs();if(root)await rm(root,{recursive:true,force:true});root=undefined;});
describe("chat image storage",()=>{
 it("normalizes a signed chat upload to a bounded content-addressed WebP",async()=>{root=await mkdtemp(join(tmpdir(),"bw-chat-media-"));vi.stubEnv("BITCOINWALK_MEDIA_ROOT",root);const bytes=await sharp({create:{width:1800,height:900,channels:4,background:"white"}}).png().toBuffer(),record=await storeChatImage({groupId:"chat",actor:"a".repeat(64),bytes,mime:"image/png",origin:"https://app-staging.bitcoinwalk.org"});expect(record.internalUrl).toMatch(/^https:\/\/app-staging\.bitcoinwalk\.org\/api\/media\/files\/[a-f0-9]{64}\.webp$/);const output=await readMedia(record.contentHash!);expect(output).not.toBeNull();expect(await sharp(output!).metadata()).toMatchObject({format:"webp",width:1600,height:800});expect(JSON.parse(await readFile(join(root,"manifest.json"),"utf8"))).toMatchObject({version:1,records:[{cityId:"chat:chat",status:"healthy"}]});});
 it("rejects content that does not match its declared image type",async()=>{root=await mkdtemp(join(tmpdir(),"bw-chat-media-bad-"));vi.stubEnv("BITCOINWALK_MEDIA_ROOT",root);const bytes=await sharp({create:{width:10,height:10,channels:3,background:"white"}}).jpeg().toBuffer();await expect(storeChatImage({groupId:"chat",actor:"a".repeat(64),bytes,mime:"image/png",origin:"https://app-staging.bitcoinwalk.org"})).rejects.toThrow("valid JPEG");});
});
