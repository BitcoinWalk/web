import {lstatSync,readFileSync,realpathSync} from "node:fs";
import {isAbsolute} from "node:path";
import {timingSafeEqual} from "node:crypto";

function token():string{
 const path=process.env.BITCOINWALK_RELAY_PROVISION_TOKEN_FILE?.trim();
 if(!path||!isAbsolute(path)||realpathSync(path)!==path)throw new Error("Invalid relay provision token path");
 const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.size<43||stat.size>256)throw new Error("Invalid relay provision token file");
 const value=readFileSync(path,"utf8").trim();if(!/^[A-Za-z0-9_-]{43,256}$/.test(value))throw new Error("Invalid relay provision token");return value;
}
export function authorizedRelayProvisionWorker(request:Request):boolean{
 try{const header=request.headers.get("authorization")??"",expected=`Bearer ${token()}`,left=Buffer.from(header),right=Buffer.from(expected);return left.length===right.length&&timingSafeEqual(left,right);}catch{return false;}
}
