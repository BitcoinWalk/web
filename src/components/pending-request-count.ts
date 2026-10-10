export const pendingRequestCountEvent="bitcoinwalk:pending-request-count";
export const dashboardMenuRefreshEvent="bitcoinwalk:dashboard-menu-refresh";
export type PendingRequestCountSource="cities"|"pro-activations";
export type PendingRequestCountDetail={source:PendingRequestCountSource;count:number};

export function announcePendingRequestCount(count:number,source:PendingRequestCountSource="cities"){
 if(typeof window!=="undefined"){
  window.dispatchEvent(new CustomEvent<PendingRequestCountDetail>(pendingRequestCountEvent,{detail:{source,count}}));
  window.dispatchEvent(new Event(dashboardMenuRefreshEvent));
 }
}

export function pendingRequestCountFromEvent(event:Event):PendingRequestCountDetail|null{
 const detail=(event as CustomEvent<unknown>).detail;
 if(!detail||typeof detail!=="object")return null;
 const {source,count}=detail as Partial<PendingRequestCountDetail>;
 return (source==="cities"||source==="pro-activations")&&typeof count==="number"&&Number.isSafeInteger(count)&&count>=0?{source,count}:null;
}
