import type {WebPushPreferences} from "./web-push-auth";
import {deliverWebPush} from "./web-push-delivery";
import {WebPushStore,type WebNotification} from "./web-push-store";

export type NotificationCandidate={ownerPubkey:string;dedupeKey:string;category:WebNotification["category"];title:string;body:string;path:string;tag:string};
type Deliver=typeof deliverWebPush;

export function inQuietHours(preferences:WebPushPreferences,at:number):boolean{
 if(preferences.quietStart===null||preferences.quietEnd===null||preferences.quietStart===preferences.quietEnd)return false;
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:preferences.timeZone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(at*1000));
 const hour=Number(parts.find(part=>part.type==="hour")?.value),minute=Number(parts.find(part=>part.type==="minute")?.value),current=hour*60+minute;
 const value=(clock:string)=>{const [h,m]=clock.split(":").map(Number);return h*60+m;},start=value(preferences.quietStart),end=value(preferences.quietEnd);
 return start<end?current>=start&&current<end:current>=start||current<end;
}

export class WebNotificationService{
 constructor(readonly store:WebPushStore,private deliver:Deliver=deliverWebPush,private now=()=>Math.floor(Date.now()/1000)){}
 async send(candidate:NotificationCandidate){
  const notice=this.store.createNotice(candidate.ownerPubkey,candidate),devices=this.store.rawDevices(candidate.ownerPubkey).filter(device=>candidate.category==="walk-reminder"?device.preferences.walkReminders:device.preferences.workflowUpdates);
  let sent=0,deferred=0,failed=0;
  for(const device of devices){
   const delivery=this.store.reserveDelivery(notice.id,device.id),now=this.now();
   if(delivery.state==="sent")continue;
   if(delivery.nextAttemptAt>now){deferred++;continue;}
   if(inQuietHours(device.preferences,now)){this.store.deferDelivery(notice.id,device.id,now+300);deferred++;continue;}
   if(!this.store.claimDelivery(notice.id,device.id))continue;
   try{
    await this.deliver(device,{title:candidate.title,body:candidate.body,path:candidate.path,tag:candidate.tag});
    this.store.delivered(candidate.ownerPubkey,device.id);this.store.finishDelivery(candidate.ownerPubkey,notice.id,device.id,"sent");sent++;
   }catch(error){
    const status=typeof error==="object"&&error&&"statusCode" in error?Number((error as {statusCode?:number}).statusCode):0;
    if(status===404||status===410)this.store.remove(candidate.ownerPubkey,device.id,"expired");else this.store.failed(candidate.ownerPubkey,device.id);
    const attempts=this.store.delivery(notice.id,device.id)?.attempts??0,retryAt=status===404||status===410?now+90*86400:now+Math.min(3600,60*2**Math.min(attempts,6));
    this.store.finishDelivery(candidate.ownerPubkey,notice.id,device.id,"failed",retryAt);failed++;
   }
  }
  return {noticeId:notice.id,created:notice.created,devices:devices.length,sent,deferred,failed};
 }
}
