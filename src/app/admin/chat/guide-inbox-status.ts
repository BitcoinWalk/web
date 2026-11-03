export function guideInboxStatus(guide:PromiseSettledResult<string[]>,own:PromiseSettledResult<string[]>){
 const guideRelays=guide.status==="fulfilled"?guide.value:[],ownRelays=own.status==="fulfilled"?own.value:[];
 const problems=[];
 if(!guideRelays.length)problems.push("The Guide’s private inbox could not be found. Retry the connection in a moment.");
 if(!ownRelays.length)problems.push("Your private inbox could not be found. Check your inbox relay setup in your Nostr app, then retry the connection.");
 return {guideRelays,ownRelays,message:problems.join(" ")};
}
