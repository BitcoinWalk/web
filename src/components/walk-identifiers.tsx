import CopyValue from "./copy-value";

export function compactNostrIdentifier(value:string){
 const separator=value.indexOf("1");
 const prefixEnd=separator>=0?separator+4:8;
 return value.length<=prefixEnd+6?value:`${value.slice(0,prefixEnd)}...${value.slice(-3)}`;
}

export default function WalkIdentifiers({organizerNpub,nevent}:{organizerNpub:string;nevent:string}){
 return <small>
  Organizer: <CopyValue label="organizer npub" value={organizerNpub} displayValue={compactNostrIdentifier(organizerNpub)}/><br/>
  Nostr event: <CopyValue label="nevent" value={nevent} displayValue={compactNostrIdentifier(nevent)}/>
 </small>;
}
