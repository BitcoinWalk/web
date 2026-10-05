/** Editorial targets; platforms may truncate previews at different widths. */
export function previewText(value:string,limit:number):string {
  const text=value.replace(/<[^>]*>/g," ").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim();
  if(Array.from(text).length<=limit)return text;
  const prefix=Array.from(text).slice(0,limit-1).join(""),boundary=prefix.lastIndexOf(" ");
  return (boundary>limit*.65?prefix.slice(0,boundary):prefix).trimEnd()+"…";
}
export function walkPreview(input:{city:string;start:number;end:number;timeZone:string|null;meetingPoint:string},now=Date.now()) {
  const city=previewText(input.city,100),date=new Date(input.start*1000),zone=input.timeZone||"UTC";
  const fullDate=new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:zone}).format(date);
  const shortDate=new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long",timeZone:zone}).format(date);
  const time=new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit",hour12:true,timeZone:zone}).format(date)+(input.timeZone?"":" UTC");
  const past=input.end*1000<now;
  const title=previewText(`BitcoinWalk ${city} | ${past?"Past walk · ":""}${fullDate}`,80);
  const lead=past?`BitcoinWalk ${city} took place on ${shortDate} at ${time}.`:`Join BitcoinWalk ${city} on ${shortDate} at ${time}.`;
  const place=previewText(input.meetingPoint,65);
  const description=previewText(`${lead} ${past?"Meeting point:":"Meet at"} ${place}${past?".":" for a friendly walk and conversation. Everyone is welcome."}`,160);
  return {title,description};
}
export function cityPreview(city:string){return {title:previewText(`BitcoinWalk ${city} | Walk, talk and meet Bitcoiners`,65),description:previewText(`Join BitcoinWalk ${city} to meet fellow Bitcoiners, explore the city and share ideas on foot. Discover upcoming walks and find your local community.`,160)};}
