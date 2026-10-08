import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";

const MAGIC=Buffer.from("BWBKUP01","ascii");
const IV_BYTES=12;
const TAG_BYTES=16;
const MAX_BYTES=512*1024*1024;

/** Authenticated backup envelope for already-closed private artifacts.
 * This is intentionally a pure byte transform: callers must stop/fence writers,
 * checkpoint SQLite and store keys outside the backup/restore domain. */
export function sealBackup(plain:Uint8Array,key:Uint8Array,context:string){
  validate(plain,key,context);
  const iv=randomBytes(IV_BYTES);
  const cipher=createCipheriv("aes-256-gcm",key,iv);
  cipher.setAAD(Buffer.from(context,"utf8"));
  const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);
  return Buffer.concat([MAGIC,iv,cipher.getAuthTag(),encrypted]);
}

export function openBackup(envelope:Uint8Array,key:Uint8Array,context:string){
  validate(envelope,key,context);
  const bytes=Buffer.from(envelope);
  if(bytes.length<MAGIC.length+IV_BYTES+TAG_BYTES||!bytes.subarray(0,MAGIC.length).equals(MAGIC))throw new Error("Backup authentication failed");
  try{
    const iv=bytes.subarray(MAGIC.length,MAGIC.length+IV_BYTES);
    const tag=bytes.subarray(MAGIC.length+IV_BYTES,MAGIC.length+IV_BYTES+TAG_BYTES);
    const encrypted=bytes.subarray(MAGIC.length+IV_BYTES+TAG_BYTES);
    const decipher=createDecipheriv("aes-256-gcm",key,iv);
    decipher.setAAD(Buffer.from(context,"utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted),decipher.final()]);
  }catch{throw new Error("Backup authentication failed");}
}

function validate(bytes:Uint8Array,key:Uint8Array,context:string){
  if(key.byteLength!==32)throw new Error("Backup key must be 32 bytes");
  if(bytes.byteLength===0||bytes.byteLength>MAX_BYTES)throw new Error("Invalid backup size");
  if(!/^[a-z0-9][a-z0-9:._/-]{2,127}$/i.test(context))throw new Error("Invalid backup context");
}
