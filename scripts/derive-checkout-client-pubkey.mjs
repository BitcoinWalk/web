import {createECDH} from "node:crypto";
import {lstatSync,readFileSync,realpathSync,renameSync,writeFileSync} from "node:fs";

const [environmentPath,outputPath]=process.argv.slice(2);
if(process.getuid?.()===0||!environmentPath||!outputPath)throw new Error();
const stat=lstatSync(environmentPath);
if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||(stat.mode&0o077)!==0||stat.uid!==process.getuid()||realpathSync(environmentPath)!==environmentPath)throw new Error();
const line=readFileSync(environmentPath,"utf8").split(/\r?\n/).find(value=>value.startsWith("BITCOINWALK_NWC_URL="));
if(!line)throw new Error();
let raw=line.slice("BITCOINWALK_NWC_URL=".length).trim();
if((raw.startsWith('"')&&raw.endsWith('"'))||(raw.startsWith("'")&&raw.endsWith("'")))raw=raw.slice(1,-1);
const uri=new URL(raw),secret=uri.searchParams.get("secret");
if(uri.protocol!=="nostr+walletconnect:"||!secret||!(/^[0-9a-f]{64}$/).test(secret))throw new Error();
const curve=createECDH("secp256k1");curve.setPrivateKey(Buffer.from(secret,"hex"));
const publicKey=curve.getPublicKey(undefined,"compressed").subarray(1).toString("hex");
const temporary=`${outputPath}.${process.pid}`;process.umask(0o077);writeFileSync(temporary,`${publicKey}\n`,{mode:0o600,flag:"wx"});renameSync(temporary,outputPath);
