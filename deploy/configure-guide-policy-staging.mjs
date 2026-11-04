import {readFileSync,lstatSync,copyFileSync,mkdtempSync,writeFileSync,renameSync,rmdirSync,chmodSync} from "node:fs";
import {userInfo} from "node:os";
import assert from "node:assert/strict";

assert.equal(userInfo().username,"bitcoinwalk","Run as the staging application owner.");
const path="/home/bitcoinwalk/.config/bitcoinwalk/app.env",stat=lstatSync(path),expected="9bb58bb2727e98e2008e3385ebfaa512caac9b99daacfc3d0392523d75b34d3c";
assert(stat.isFile()&&stat.uid===process.getuid()&&(stat.mode&0o077)===0,"Staging environment permissions are unsafe.");
const source=readFileSync(path,"utf8"),rows=source.match(/^BITCOINWALK_GUIDE_PUBKEY=.*$/gm)??[];
assert(rows.length<=1,"Duplicate Guide configuration requires review.");
if(rows.length){assert.equal(rows[0].split("=").slice(1).join("=").replace(/^["']|["']$/g,""),expected,"A different Guide identity is already configured.");console.log("Staging Guide public identity already configured.");}
else{
 const backup=mkdtempSync("/home/bitcoinwalk/backups/guide-staging-env."),temp=mkdtempSync("/home/bitcoinwalk/.config/bitcoinwalk/guide-env.");
 copyFileSync(path,`${backup}/app.env`);chmodSync(`${backup}/app.env`,0o600);
 try{writeFileSync(`${temp}/app.env`,`${source.trimEnd()}\nBITCOINWALK_GUIDE_PUBKEY=${expected}\n`,{mode:0o600});renameSync(`${temp}/app.env`,path);}finally{rmdirSync(temp);}
 console.log(`Staging Guide public identity configured. Environment backup: ${backup}`);
}
