export const pendingRequestCountEvent="bitcoinwalk:pending-request-count";
export const dashboardMenuRefreshEvent="bitcoinwalk:dashboard-menu-refresh";

export function announcePendingRequestCount(count:number){
 if(typeof window!=="undefined"){
  window.dispatchEvent(new CustomEvent<number>(pendingRequestCountEvent,{detail:count}));
  window.dispatchEvent(new Event(dashboardMenuRefreshEvent));
 }
}

export function pendingRequestCountFromEvent(event:Event):number|null{
 const count=(event as CustomEvent<unknown>).detail;
 return typeof count==="number"&&Number.isSafeInteger(count)&&count>=0?count:null;
}
