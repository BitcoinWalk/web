import {cityDocumentSchema} from "../domain/city";
import {registrationLocalDateTime,type Meridiem} from "../domain/registration-time";
import {registrationSeriesDates,type RegistrationRepeat} from "../domain/registration-recurrence";

type Details={cityName:string;location:{latitude:number;longitude:number;description:string}|null;walkDate:string;walkHour:string;walkMinute:string;meridiem?:Meridiem;description:string;meetingDescription:string;repeat:RegistrationRepeat;customInterval:number;customWeekday:number};
export type DetailError={message:string;selector:string};
/** Presentation-level validation timing only; reuse the existing domain rules. */
export function validateDetailsStep(step:number,fields:Details):DetailError|null{
 const f=fields;
 if(step===1&&!cityDocumentSchema.shape.cityName.safeParse(f.cityName.trim()).success)return {message:"Enter a city name of up to 100 characters.",selector:'[data-location-city] input'};
 if(step===2&&!cityDocumentSchema.shape.meetingPoint.pick({latitude:true,longitude:true}).safeParse(f.location).success)return {message:"Choose a meeting place, place the pin on the map, or apply valid coordinates before continuing.",selector:'[data-location-map] input'};
 if(step===3){
  try{registrationLocalDateTime(f.walkDate,f.walkHour,f.walkMinute,f.meridiem);}
  catch(error){return {message:error instanceof Error?error.message:"Choose a date and time.",selector:!f.walkDate?'[name="walkDate"]':!(f.meridiem?/^([1-9]|1[0-2])$/:/^([01]?\d|2[0-3])$/).test(f.walkHour)?'[name="walkHour"]':'[name="walkMinute"]'};}
 }
 if(step===4&&!cityDocumentSchema.shape.description.safeParse(f.description.trim()).success)return {message:"Add a walk description of up to 5,000 characters.",selector:'[contenteditable="true"], [data-detail-step="4"] textarea'};
 if(step===5){
  if(!cityDocumentSchema.shape.meetingPoint.shape.description.safeParse(f.meetingDescription.trim()||f.location?.description||"").success)return {message:"Add a meeting-point description of up to 500 characters.",selector:'[name="meetingDescription"]'};
  try{registrationSeriesDates(f.walkDate,f.repeat,f.customInterval,f.customWeekday);}
  catch(error){return {message:error instanceof Error?error.message:"Check the repeat schedule.",selector:'[data-detail-step="5"] input[type="number"]'};}
 }
 return null;
}
