import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {getPublicKey} from "nostr-tools";

function sha(path:string){return createHash("sha256").update(readFileSync(path)).digest("hex");}
function manifest(path:string){return Object.fromEntries(readFileSync(path,"utf8").trim().split("\n").map(line=>{const at=line.indexOf("=");if(at<1)throw new Error();return [line.slice(0,at),line.slice(at+1)];}));}
function main(){
 if(process.argv[2]==="pair"){
  const secret=readFileSync(process.argv[3],"utf8").trim(),pubkey=readFileSync(process.argv[4],"utf8").trim();
  if(!/^[0-9a-f]{64}$/.test(secret)||!/^([0-9a-f]{64})$/.test(pubkey)||getPublicKey(Uint8Array.from(Buffer.from(secret,"hex")))!==pubkey)throw new Error();
  process.stdout.write("RECEIPT_KEY_PAIR_OK\n");return;
 }
 const component=process.argv[2],root=process.argv[3];if((component!=="worker"&&component!=="signer")||!root)throw new Error();
 const values=manifest(join(root,"manifest.txt"));if(values.component!==`receipt-${component}`||!/^\d{8}T\d{6}Z$/.test(values.created)||values.database_sha256!==sha(join(root,"database.sqlite")))throw new Error();
 const db=new DatabaseSync(join(root,"database.sqlite"),{readOnly:true});try{if(Object.values(db.prepare("PRAGMA integrity_check").get()!)[0]!=="ok")throw new Error();}finally{db.close();}
 if(component==="signer"){
  const secret=readFileSync(join(root,"provider-secret-key"),"utf8").trim(),pubkey=readFileSync(join(root,"provider-pubkey"),"utf8").trim();
  if(!/^[0-9a-f]{64}$/.test(secret)||!/^([0-9a-f]{64})$/.test(pubkey)||values.provider_secret_sha256!==sha(join(root,"provider-secret-key"))||values.provider_pubkey_sha256!==sha(join(root,"provider-pubkey"))||getPublicKey(Uint8Array.from(Buffer.from(secret,"hex")))!==pubkey)throw new Error();
 }
 process.stdout.write(`RECEIPT_RESTORE_MATERIAL_OK component=${component}\n`);
}
try{main();}catch{process.exitCode=1;}
