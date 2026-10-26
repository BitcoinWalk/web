import {describe,it,expect,vi} from "vitest";
import {parseRegistrationDraft,saveRegistrationDraft} from "./registration-browser-draft";
const draft={version:1 as const,savedAt:Date.now(),step:1,detailStep:1,cityName:"London",walkDate:"",walkHour:"",walkMinute:"",meridiem:"AM" as const,repeat:"weekly" as const,customInterval:3,customWeekday:6,description:"A walk",meetingDescription:"",location:null};
describe("browser walk drafts",()=>{
 it("restores only allowed form fields",()=>{const result=parseRegistrationDraft(JSON.stringify({...draft,privateKey:"secret",signerInput:"secret",payoutDestination:"private",authenticated:true}));expect(result).toEqual(draft);});
 it("rejects expired, corrupt and invalid drafts",()=>{expect(parseRegistrationDraft(JSON.stringify(draft),draft.savedAt+8*86400000)).toBeNull();expect(parseRegistrationDraft("bad json")).toBeNull();expect(parseRegistrationDraft(JSON.stringify({...draft,detailStep:99}))).toBeNull();expect(parseRegistrationDraft(JSON.stringify({...draft,location:{latitude:999,longitude:0,description:""}}))).toBeNull();});
 it("does not save private-key or signer credentials pasted into fields",()=>{for(const description of ["nsec1abcdef","bunker://secret","nostrconnect://secret"]){const storage={setItem:vi.fn(),removeItem:vi.fn()};expect(saveRegistrationDraft(storage,{...draft,description})).toBe(false);expect(storage.setItem).not.toHaveBeenCalled();expect(storage.removeItem).toHaveBeenCalled();}});
 it("handles unavailable browser storage",()=>{expect(saveRegistrationDraft({setItem(){throw Error("blocked");},removeItem(){}},draft)).toBe(false);});
});
