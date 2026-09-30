export type Meridiem="AM"|"PM";

export const QUARTER_HOUR_OPTIONS=Array.from({length:48},(_,index)=>{
 const hour24=Math.floor(index/4),minute=(index%4)*15,hour12=hour24%12||12;
 return `${hour12}:${String(minute).padStart(2,"0")}`;
});

/** Produces the same timezone-less local value previously supplied by datetime-local. */
export function registrationLocalDateTime(date:string,time:string,meridiem:Meridiem):string {
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(date))throw new Error("Choose a valid walk date.");
 const midnight=Date.parse(`${date}T00:00:00Z`);
 if(!Number.isFinite(midnight)||new Date(midnight).toISOString().slice(0,10)!==date)throw new Error("Choose a valid walk date.");
 const match=/^(1[0-2]|[1-9]):(00|15|30|45)$/.exec(time);
 if(!match)throw new Error("Choose a walk time in 15-minute intervals.");
 const hour12=Number(match[1]),hour24=hour12%12+(meridiem==="PM"?12:0);
 return `${date}T${String(hour24).padStart(2,"0")}:${match[2]}`;
}
