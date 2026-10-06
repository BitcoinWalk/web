export type RegistrationRepeat="weekly"|"fortnightly"|"custom"|"none";

const DAY=86_400_000;
export const REGISTRATION_SERIES_SIZE=8;

function validDate(value:string){
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(value))throw new Error("Choose a valid first-walk date.");
 const time=Date.parse(`${value}T00:00:00Z`);
 if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)throw new Error("Choose a valid first-walk date.");
 return time;
}

export function registrationSeriesDates(firstDate:string,repeat:RegistrationRepeat,customIntervalWeeks=3,customWeekday=6):string[]{
 const first=validDate(firstDate);
 if(repeat==="none")return [firstDate];
 const interval=repeat==="weekly"?1:repeat==="fortnightly"?2:customIntervalWeeks;
 if(!Number.isInteger(interval)||interval<1||interval>12)throw new Error("Choose a custom interval between 1 and 12 weeks.");
 if(!Number.isInteger(customWeekday)||customWeekday<0||customWeekday>6)throw new Error("Choose a weekday for the custom schedule.");
 if(repeat!=="custom")return Array.from({length:REGISTRATION_SERIES_SIZE},(_,index)=>new Date(first+index*interval*7*DAY).toISOString().slice(0,10));
 const dates=[firstDate];
 const firstDay=new Date(first).getUTCDay();
 let next=first+((customWeekday-firstDay+7)%7||7)*DAY;
 while(Math.floor((next-first)/(7*DAY))%interval!==0)next+=7*DAY;
 while(dates.length<REGISTRATION_SERIES_SIZE){dates.push(new Date(next).toISOString().slice(0,10));next+=interval*7*DAY;}
 return dates;
}

export function registrationSeriesStarts(firstLocalDateTime:string,dates:string[]):string[]{
 const clock=firstLocalDateTime.slice(10);
 return dates.map(date=>{
  const value=new Date(`${date}${clock}`);
  if(Number.isNaN(value.getTime()))throw new Error("Choose a valid recurring date and time.");
  return value.toISOString();
 });
}
