export function walkHostInvitationText(input:{cityName:string;start:number;timeZone:string|null;acceptUrl:string}):string{
 const zone=input.timeZone??"UTC";
 const date=new Date(input.start*1000);
 if(!Number.isSafeInteger(input.start)||Number.isNaN(date.getTime()))throw new Error("Walk start time is invalid.");
 const day=new Intl.DateTimeFormat("en-GB",{timeZone:zone,dateStyle:"full"}).format(date);
 const time=new Intl.DateTimeFormat("en-US",{timeZone:zone,hour:"numeric",minute:"2-digit",hour12:true}).format(date).replace(/\s+/g,"").toLowerCase();
 const timeLabel=input.timeZone?`${time} local time`:`${time} UTC`;
 return `Please accept this invite to host the BitcoinWalk in **${input.cityName} on ${day} at ${timeLabel}** — we chose you because you'd make an amazing host:\n\n${input.acceptUrl}\n\nA few things to make it great:\n\n- **Make everyone feel welcome** — greet each walker as they arrive, introduce newbies, and keep the vibe friendly and unhurried.\n- **Spark good conversations** — great openers for newcomers: *why self-custody is a silent revolution*, or *how a fixed supply of 21M is a first in human history*.\n- **Privacy first** — we take privacy seriously. No photos revealing who other participants are, so everyone can walk and talk freely.\n- Have fun, connect with local community and post the #ProofOfWalk\n\nHonoured to have you lead the way! 🟠`;
}
