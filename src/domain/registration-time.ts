export type Meridiem="AM"|"PM";

export const HOUR_OPTIONS=Array.from({length:12},(_,index)=>String(index+1));
export const MINUTE_OPTIONS=["00","15","30","45"] as const;

/** Produces the same timezone-less local value previously supplied by datetime-local. */
export function registrationLocalDateTime(date:string,hour:string,minute:string,meridiem:Meridiem):string {
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(date))throw new Error("Choose a valid walk date.");
 const midnight=Date.parse(`${date}T00:00:00Z`);
 if(!Number.isFinite(midnight)||new Date(midnight).toISOString().slice(0,10)!==date)throw new Error("Choose a valid walk date.");
 if(!/^(1[0-2]|[1-9])$/.test(hour)||!MINUTE_OPTIONS.includes(minute as typeof MINUTE_OPTIONS[number]))throw new Error("Choose a walk time in 15-minute intervals.");
 const hour24=Number(hour)%12+(meridiem==="PM"?12:0);
 return `${date}T${String(hour24).padStart(2,"0")}:${minute}`;
}
