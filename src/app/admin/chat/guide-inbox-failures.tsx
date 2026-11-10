import {nip17OpenStages} from "../../../nostr/nip17-inbox";
import type {GuideOpenFailure} from "../../../nostr/guide-history";

export default function GuideInboxFailures({failures}:{failures:GuideOpenFailure[]}){
 if(!failures.length)return null;
 return <details><summary>Troubleshoot {failures.length} unreadable private {failures.length===1?"message":"messages"}</summary><p>These event IDs identify the encrypted envelopes that could not be opened. They may belong to other private conversations. No message text or signer response is included.</p><ul>{failures.map(failure=><li key={failure.wrapId}><code style={{overflowWrap:"anywhere"}}>{failure.wrapId}</code><p>{failure.stage==="unknown"?"The message could not be opened.":nip17OpenStages[failure.stage]}</p></li>)}</ul></details>;
}
