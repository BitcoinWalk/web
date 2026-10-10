const fragmentKey="bitcoinwalk-upgrade";
export function validGiftRecoveryToken(value:string|null|undefined):value is string{return /^[a-f0-9]{64}$/.test(value??"");}
export function giftRecoveryTokenFromHash(hash:string):string|null{
 const value=new URLSearchParams(hash.startsWith("#")?hash.slice(1):hash).get(fragmentKey);
 return validGiftRecoveryToken(value)?value:null;
}
export function giftRecoveryURL(href:string,token:string):string{
 if(!validGiftRecoveryToken(token))throw new Error("Invalid gift recovery token");
 const url=new URL(href);url.hash=new URLSearchParams({[fragmentKey]:token}).toString();return url.href;
}
