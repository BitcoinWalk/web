import {guideEvaluationCases,type GuideEvaluationCheck} from "./evaluation";
import type {GuideDraft} from "./assistant";

const DOC="https://docs.bitcoinwalk.org/chat/walkie-talkie-and-guide/";
const DIFFICULTY="What is Bitcoin difficulty adjustment?",FALLBACK="Explain the Guide's reviewed-question coverage.";
const aliases:[RegExp,string][]=[
 [/^(?:what (?:is|does) (?:bitcoin(?:'s)? )?difficulty adjustment(?: mean)?|how does (?:bitcoin(?:'s)? )?difficulty adjustment work|why does bitcoin mining difficulty change)\??$/,"difficulty"],
 [/^(?:what is sound money|why does bitcoinwalk focus on bitcoin|why bitcoin only)\??$/,"bitcoin-education"],
 [/^(?:how (?:can|do) i find (?:a )?(?:local )?bitcoinwalk(?: near me)?|where (?:can|do) i find (?:a )?(?:local )?bitcoinwalk)\??$/,"find-walk"],
 [/^how (?:can|do) i (?:start|register) (?:a )?bitcoinwalk(?: in my city)?\??$/,"start-city"],
 [/^(?:how (?:can|do) i add (?:the |my |a )?(?:next|next week's|next week’s) walk|can (?:someone|another organizer) (?:else )?host my walk)\??$/,"walks"],
 [/^(?:what is (?:the |my )?(?:basic )?guide (?:allowance|limit)|how many (?:guide )?(?:answers|replies) (?:can|do) i get)\??$/,"cooldown"],
];
function normalized(value:string){return value.trim().replace(/\s+/g," ").toLowerCase();}
/** Fully anchored reviewed intents: extra instructions never reach the model. */
export function reviewedGuideQuestion(content:string):GuideEvaluationCheck{
 const value=normalized(content),exact=guideEvaluationCases.find(row=>!row.escalate&&normalized(row.content)===value);
 if(exact)return exact;
 const route=aliases.find(([pattern])=>pattern.test(value))?.[1];
 if(route==="difficulty")return {id:"difficulty",content:DIFFICULTY,escalate:false,needsCitation:true};
 const canonical=guideEvaluationCases.find(row=>row.id===route);
 return canonical??{id:"coverage",content:FALLBACK,escalate:false,needsCitation:true};
}
export function reviewedGuideStaticAnswer(content:string):GuideDraft|undefined{
 if(content===DIFFICULTY)return {
  draft:"Bitcoin difficulty adjustment changes how hard it is for miners to find a valid block. On Bitcoin mainnet it happens every 2,016 blocks, aiming to keep the average block interval close to 10 minutes.\n\nIf blocks were found faster than the roughly two-week target period, difficulty rises; if they were slower, difficulty falls. A retarget is limited to a factor of four in either direction. It adjusts mining work, not Bitcoin's price, and does not guarantee when any individual block will arrive.",
  citations:["https://developer.bitcoin.org/devguide/block_chain.html#proof-of-work"],escalate:false,reason:"Reviewed Bitcoin mainnet difficulty explanation.",
 };
 if(content===FALLBACK)return {draft:"I don't yet have a reviewed answer to that question. I can help with reviewed BitcoinWalk procedures, sound money and Bitcoin difficulty adjustment. Try asking how to find or start a walk, add the next walk, or invite another host. I cannot perform account, payment or signer changes, provide private records, or help with other cryptocurrencies. Never share signing secrets or recovery phrases.",citations:[DOC],escalate:false,reason:"Transparent coverage response; no protected action or unsupported claim."};
}
