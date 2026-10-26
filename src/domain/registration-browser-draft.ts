import {z} from "zod";

export const REGISTRATION_DRAFT_KEY="bitcoinwalk:registration-draft:v1";
const lifetime=7*24*60*60*1000;
const schema=z.object({
 version:z.literal(1),savedAt:z.number().finite(),step:z.number().int().min(1).max(3),detailStep:z.number().int().min(1).max(5),
 cityName:z.string().max(120),walkDate:z.string().max(10),walkHour:z.string().max(2),walkMinute:z.string().max(2),meridiem:z.enum(["AM","PM"]).optional(),timeFormat:z.literal("24h").optional(),
 repeat:z.enum(["weekly","fortnightly","custom","none"]),customInterval:z.number().int().min(1).max(12),customWeekday:z.number().int().min(0).max(6),
 description:z.string().max(5000),meetingDescription:z.string().max(500),
 location:z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),description:z.string().max(1000),countryCode:z.string().max(3).optional()}).nullable(),
});
export type RegistrationBrowserDraft=z.infer<typeof schema>;
export function parseRegistrationDraft(raw:string|null,now=Date.now()):RegistrationBrowserDraft|null{
 if(!raw||raw.length>20000)return null;
 try{const result=schema.safeParse(JSON.parse(raw));if(!result.success)return null;const value=result.data;if(value.savedAt>now||now-value.savedAt>lifetime)return null;
 // Never persist a pasted private key or a remote-signer connection, even in a text field.
 if(/nsec1[0-9a-z]+|bunker:\/\/|nostrconnect:\/\//i.test(JSON.stringify(value)))return null;
 return value;}catch{return null;}
}
export function saveRegistrationDraft(storage:Pick<Storage,"setItem"|"removeItem">,value:RegistrationBrowserDraft){
 try{const clean=parseRegistrationDraft(JSON.stringify(value));if(!clean){storage.removeItem(REGISTRATION_DRAFT_KEY);return false;}storage.setItem(REGISTRATION_DRAFT_KEY,JSON.stringify(clean));return true;}catch{return false;}
}
