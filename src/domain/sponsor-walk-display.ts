export function sponsorWalkLabel(cityName:string,start:number,timeZone:string){
 const parts=new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false,timeZone}).formatToParts(new Date(start*1000));
 const value=(type:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===type)?.value??"";
 return `${cityName} · ${value("day")} ${value("month")} ${value("year")}, ${value("hour")}:${value("minute")}`;
}

export function chronologically<T extends {start:number;label:string}>(rows:T[]){
 return [...rows].sort((a,b)=>a.start-b.start||a.label.localeCompare(b.label));
}
