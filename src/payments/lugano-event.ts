export const LUGANO_EVENT_START=Date.parse("2026-10-25T10:00:00+01:00")/1000;
export const LUGANO_EVENT_SATS=210000;
export function isLuganoSponsorEvent(slug:string,start:number){return slug==="lugano"&&start===LUGANO_EVENT_START;}
