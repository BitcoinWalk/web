export type Meridiem="AM"|"PM";

export const HOUR_OPTIONS=Array.from({length:12},(_,index)=>String(index+1));
export const HOUR_24_OPTIONS=Array.from({length:24},(_,index)=>String(index).padStart(2,"0"));
export const MINUTE_OPTIONS=["00","15","30","45"];

export function registrationDateLabel(date:string):string {
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
 return match?`${match[3]}/${match[2]}/${match[1]}`:"";
}

/** Produces the same timezone-less local value previously supplied by datetime-local. */
export function registrationLocalDateTime(date:string,hour:string,minute:string,meridiem?:Meridiem):string {
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(date))throw new Error("Choose a valid walk date.");
 const midnight=Date.parse(`${date}T00:00:00Z`);
 if(!Number.isFinite(midnight)||new Date(midnight).toISOString().slice(0,10)!==date)throw new Error("Choose a valid walk date.");
 if(!(meridiem?/^(1[0-2]|[1-9])$/:/^(?:[01]?\d|2[0-3])$/).test(hour)||!/^[0-5]?\d$/.test(minute))throw new Error(`Choose an hour from ${meridiem?"1 to 12":"00 to 23"} and minutes from 00 to 59.`);
 const hour24=meridiem?Number(hour)%12+(meridiem==="PM"?12:0):Number(hour);
 return `${date}T${String(hour24).padStart(2,"0")}:${minute.padStart(2,"0")}`;
}
