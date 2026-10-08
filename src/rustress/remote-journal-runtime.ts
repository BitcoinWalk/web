import {constants, closeSync, lstatSync, openSync, readFileSync, realpathSync, readdirSync, unlinkSync} from "node:fs";
import {isAbsolute, join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {RemoteJournalStore} from "./remote-journal-store";
import {createRemoteJournalServer} from "./remote-journal-server";

const configSchema=z.object({binding:z.string().regex(/^[0-9a-f]{64}$/),port:z.number().int().min(1024).max(65535)}).strict();

/** An exclusive, private, pre-provisioned directory; no chmod or repair on startup. */
export async function startRemoteJournal(directory:string){
 const uid=process.getuid?.();
 if(uid===undefined||uid===0||Number(process.versions.node.split(".")[0])<24)throw new Error("Non-root Node 24+ required");
 process.umask(0o077);
 if(!isAbsolute(directory)||realpathSync(directory)!==directory)throw new Error("Canonical private directory required");
 const check=(path:string,dir=false)=>{
  const s=lstatSync(path);
  if(s.uid!==uid||s.isSymbolicLink()||(dir?!s.isDirectory():!s.isFile())||
   (s.mode&0o777)!==(dir?0o700:0o600)||(!dir&&s.nlink!==1))throw new Error("Private owned storage required");
 };
 check(directory,true);
 for(const name of readdirSync(directory))check(join(directory,name));
 const read=(name:string)=>{
  const path=join(directory,name);check(path);
  if(lstatSync(path).size>4096)throw new Error("Configuration too large");
  return readFileSync(path,"utf8").trim();
 };
 const config=configSchema.parse(JSON.parse(read("config.json")));
 const credentials={clientToken:read("client.token"),operatorToken:read("operator.token")};
 // Validate before opening the database, including on failed startup.
 if(Object.values(credentials).some(t=>! /^[A-Za-z0-9_-]{43,256}$/.test(t))||credentials.clientToken===credentials.operatorToken)throw new Error("Separate valid credentials required");
 const lockPath=join(directory,"service.lock");
 const lock=openSync(lockPath,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
 let db:DatabaseSync|undefined;
 let server:ReturnType<typeof createRemoteJournalServer>|undefined;
 let released=false;
 const release=()=>{if(released)return;released=true;db?.close();closeSync(lock);unlinkSync(lockPath);};
 try{
  db=new DatabaseSync(join(directory,"journal.sqlite"));
  server=createRemoteJournalServer(new RemoteJournalStore(db,config.binding),credentials);
  await new Promise<void>((resolve,reject)=>{server!.once("error",reject);server!.listen(config.port,"127.0.0.1",resolve);});
  return {close:()=>new Promise<void>((resolve,reject)=>{
   server!.close(error=>{try{release();if(error)reject(error);else resolve();}catch(e){reject(e);}});
   server!.closeAllConnections();
  })};
 }catch(error){server?.close();release();throw error;}
}
