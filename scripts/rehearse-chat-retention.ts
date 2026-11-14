import assert from "node:assert/strict";
import {mkdir,mkdtemp,open,readFile,rm,stat,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";
import {storeChatImage} from "../src/server/media-store";
import {CHAT_STORAGE_BYTES} from "../src/server/chat-media-retention";

// No operator-supplied media root is ever used by this rehearsal.
async function main(){
 const sandbox=await mkdtemp(join(process.env.TEST_ARTIFACT_DIR||tmpdir(),"bw-chat-retention-rehearsal-"));
 const previous=process.env.BITCOINWALK_MEDIA_ROOT;
 const passed:string[]=[];
 try{
  const image=await sharp({create:{width:16,height:16,channels:3,background:"white"}}).png().toBuffer();
  for(const scenario of ["old-chat","protected-chat","shared-walk","corrupt-manifest","orphan"]){
   const root=join(sandbox,scenario),directory=join(root,"files");
   await mkdir(directory,{recursive:true});
   process.env.BITCOINWALK_MEDIA_ROOT=root;
   const hash="b".repeat(64),path=join(directory,hash+".webp");
   const handle=await open(path,"wx");
   try{await handle.truncate(CHAT_STORAGE_BYTES);}finally{await handle.close();}
   const storedAt=new Date(Date.now()-(scenario==="protected-chat"?89:91)*86400_000).toISOString();
   const record={id:"synthetic",cityId:"chat:synthetic",actor:"fixture",sourceUrl:"chat-upload:synthetic",contentHash:hash,bytes:1,storedAt,checkedAt:storedAt,status:"healthy"};
   const records=scenario==="orphan"?[]:scenario==="shared-walk"?[record,{...record,id:"walk",sourceUrl:"walk-upload:synthetic"}]:[record];
   await writeFile(join(root,"manifest.json"),scenario==="corrupt-manifest"?"broken":JSON.stringify({version:1,records}));
   const upload=()=>storeChatImage({groupId:"synthetic",actor:"a".repeat(64),bytes:image,mime:"image/png",origin:"https://fixture.invalid"});
   if(scenario==="old-chat"){
    const result=await upload();
    await assert.rejects(stat(path),{code:"ENOENT"});
    assert.ok((await stat(join(directory,result.contentHash+".webp"))).size<CHAT_STORAGE_BYTES);
    const manifest=JSON.parse(await readFile(join(root,"manifest.json"),"utf8"));
    assert.equal(manifest.records.length,1);
    assert.equal(manifest.records[0].contentHash,result.contentHash);
   }else{
    await assert.rejects(upload());
    assert.equal((await stat(path)).size,CHAT_STORAGE_BYTES);
    if(scenario==="corrupt-manifest")assert.equal(await readFile(join(root,"manifest.json"),"utf8"),"broken");
   }
   passed.push(scenario);
  }
 }finally{
  if(previous===undefined)delete process.env.BITCOINWALK_MEDIA_ROOT;else process.env.BITCOINWALK_MEDIA_ROOT=previous;
  await rm(sandbox,{recursive:true,force:true});
 }
 console.log(JSON.stringify({result:"CHAT_RETENTION_REHEARSAL_OK",node:process.version,storageLimitBytes:CHAT_STORAGE_BYTES,protectedDays:90,passed,synthetic:true,liveMediaChanged:false,serviceRestarted:false,temporaryFixturesRemoved:true}));
}
void main().catch(error=>{console.error("Chat retention rehearsal failed:",error instanceof Error?error.message:"unknown error");process.exitCode=1;});
