import {describe,expect,it} from "vitest";
import {validateDetailsStep} from "./registration-details-validation";
const valid={cityName:"Edinburgh",location:{latitude:55.95,longitude:-3.19,description:"City centre"},walkDate:"2027-12-18",walkHour:"11",walkMinute:"30",meridiem:"AM" as const,description:"A local walk",meetingDescription:"",repeat:"weekly" as const,customInterval:3,customWeekday:6};
describe("mobile detail screen validation",()=>{
 it("allows each valid screen using existing field rules",()=>{for(let step=1;step<=5;step++)expect(validateDetailsStep(step,valid)).toBeNull();});
 it("keeps an empty city on the city screen",()=>expect(validateDetailsStep(1,{...valid,cityName:" "})?.selector).toContain("data-location-city"));
 it("requires a pin before leaving the map screen",()=>expect(validateDetailsStep(2,{...valid,location:null})?.message).toContain("pin"));
 it("requires a date, hour and valid minute on the time screen",()=>{
  expect(validateDetailsStep(3,{...valid,walkDate:""})?.selector).toContain("walkDate");
  expect(validateDetailsStep(3,{...valid,walkHour:""})?.selector).toContain("walkHour");
  expect(validateDetailsStep(3,{...valid,walkMinute:"60"})?.selector).toContain("walkMinute");
 });
 it("requires description before advancing",()=>expect(validateDetailsStep(4,{...valid,description:" "})?.selector).toContain("contenteditable"));
 it("preserves the existing meeting-description fallback",()=>expect(validateDetailsStep(5,valid)).toBeNull());
 it("checks custom recurrence before proceeding to account",()=>expect(validateDetailsStep(5,{...valid,repeat:"custom",customInterval:0})?.message).toContain("interval"));
});
