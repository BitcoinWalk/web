export const pendingRequestCountEvent="bitcoinwalk:pending-request-count";

export function announcePendingRequestCount(count:number){
 if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent<number>(pendingRequestCountEvent,{detail:count}));
}

export function pendingRequestCountFromEvent(event:Event):number|null{
 const count=(event as CustomEvent<unknown>).detail;
 return typeof count==="number"&&Number.isSafeInteger(count)&&count>=0?count:null;
}
