type ZonedParts={year:number;month:number;day:number;hour:number;minute:number;second:number};

function formatter(timeZone:string){
 try{return new Intl.DateTimeFormat("en-CA",{timeZone,calendar:"gregory",numberingSystem:"latn",hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"});}
 catch{throw new Error(`The timezone ${timeZone || "(missing)"} is not supported.`);}
}

function partsAt(epochMs:number,timeZone:string,selected=formatter(timeZone)):ZonedParts{
 const values=Object.fromEntries(selected.formatToParts(new Date(epochMs)).filter(part=>part.type!=="literal").map(part=>[part.type,Number(part.value)]));
 return {year:values.year,month:values.month,day:values.day,hour:values.hour,minute:values.minute,second:values.second};
}

function same(a:ZonedParts,b:ZonedParts){return a.year===b.year&&a.month===b.month&&a.day===b.day&&a.hour===b.hour&&a.minute===b.minute&&a.second===b.second;}
function pad(value:number){return String(value).padStart(2,"0");}

export function sponsorshipDateTimeInput(epoch:number,timeZone:string):string{
 if(!Number.isSafeInteger(epoch)||epoch<0)throw new Error("The saved sponsorship date is invalid.");
 const value=partsAt(epoch*1000,timeZone);
 return `${value.year}-${pad(value.month)}-${pad(value.day)}T${pad(value.hour)}:${pad(value.minute)}:${pad(value.second)}`;
}

/** Convert an explicitly zoned wall-clock value to one exact epoch.
 * DST gaps and repeated clock times are rejected instead of guessed. */
export function sponsorshipEpoch(value:string,timeZone:string):number|undefined{
 if(!value)return;
 const match=/^(20\d{2})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
 if(!match)throw new Error("Enter a valid sponsorship date and time.");
 const wanted:ZonedParts={year:Number(match[1]),month:Number(match[2]),day:Number(match[3]),hour:Number(match[4]),minute:Number(match[5]),second:Number(match[6]??0)};
 const wallClock=Date.UTC(wanted.year,wanted.month-1,wanted.day,wanted.hour,wanted.minute,wanted.second);
 const checked=new Date(wallClock);
 if(checked.getUTCFullYear()!==wanted.year||checked.getUTCMonth()+1!==wanted.month||checked.getUTCDate()!==wanted.day||checked.getUTCHours()!==wanted.hour||checked.getUTCMinutes()!==wanted.minute||checked.getUTCSeconds()!==wanted.second)throw new Error("Enter a valid sponsorship date and time.");
 const zoneFormatter=formatter(timeZone),offsets=new Set<number>();
 for(const distance of [-183,-1,0,1,183]){
  const sample=wallClock+distance*86_400_000,values=Object.fromEntries(zoneFormatter.formatToParts(new Date(sample)).filter(part=>part.type!=="literal").map(part=>[part.type,Number(part.value)]));
  offsets.add(Date.UTC(values.year,values.month-1,values.day,values.hour,values.minute,values.second)-sample);
 }
 const matches=[...offsets].map(offset=>wallClock-offset).filter(candidate=>same(partsAt(candidate,timeZone,zoneFormatter),wanted));
 const unique=[...new Set(matches)];
 if(!unique.length)throw new Error(`That local time does not exist in ${timeZone} because the clocks change. Choose another time.`);
 if(unique.length>1)throw new Error(`That local time occurs twice in ${timeZone} because the clocks change. Choose another time.`);
 return Math.floor(unique[0]/1000);
}

export function sponsorshipWindowSummary(startsAt:number|undefined,endsAt:number|undefined,timeZone:string):string{
 if(startsAt===undefined&&endsAt===undefined)return `No custom date window · ${timeZone}`;
 const display=(epoch:number)=>new Intl.DateTimeFormat("en-GB",{timeZone,year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZoneName:"short"}).format(new Date(epoch*1000));
 if(startsAt!==undefined&&endsAt!==undefined)return `${display(startsAt)} → ${display(endsAt)} · ${timeZone}`;
 return startsAt!==undefined?`Starts ${display(startsAt)} · ${timeZone}`:`Ends ${display(endsAt!)} · ${timeZone}`;
}
