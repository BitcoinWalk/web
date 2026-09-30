import CopyValue from "./copy-value";

export default function WalkIdentifiers({organizerNpub,nevent}:{organizerNpub:string;nevent:string}){
 return <small>
  Organizer: <CopyValue label="organizer npub" value={organizerNpub}/><br/>
  Nostr event: <CopyValue label="nevent" value={nevent}/>
 </small>;
}
