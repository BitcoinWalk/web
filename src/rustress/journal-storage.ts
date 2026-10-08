import {lstatSync,realpathSync,statSync} from "node:fs";
import {isAbsolute,dirname,relative,sep} from "node:path";

/** Read-only deployment preflight. Existing private files/directories only:
 * provisioning/mounting is a separate operator action, never done implicitly. */
export function inspectJournalStorage(ledgerPath:string,journalPath:string){
 try{
  const uid=process.getuid?.();if(uid===undefined||uid===0)throw new Error();
  const inspect=(path:string)=>{
   if(!isAbsolute(path)||realpathSync(path)!==path||lstatSync(path).isSymbolicLink())throw new Error();
   const file=statSync(path),dir=statSync(dirname(path));
   if(!file.isFile()||!dir.isDirectory()||file.uid!==uid||dir.uid!==uid||file.nlink!==1||
    (file.mode&0o077)!==0||(dir.mode&0o077)!==0)throw new Error();
   return {file,dir:dirname(path)};
  };
  const ledger=inspect(ledgerPath),journal=inspect(journalPath);
  const contains=(a:string,b:string)=>{const r=relative(a,b);return r===""||r!==".."&&!r.startsWith(`..${sep}`)&&!isAbsolute(r);};
  if(ledger.file.dev===journal.file.dev||contains(ledger.dir,journal.dir)||contains(journal.dir,ledger.dir))throw new Error();
  return {state:"filesystem-separated" as const,activationAllowed:false as const};
 }catch{return {state:"blocked" as const,activationAllowed:false as const};}
}
