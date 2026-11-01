import {DatabaseSync} from "node:sqlite";
import {describe,expect,it} from "vitest";
import {CityRevisionAutomationStore} from "./city-revision-automation-store";
const event={id:"a".repeat(64)} as never,policy={maximumRevisions:1} as never;
describe("city revision automation audit",()=>{
 it("caps new revisions and retains the exact signed event for retry",()=>{const db=new DatabaseSync(":memory:"),store=new CityRevisionAutomationStore(db,()=>10),signed={id:"d".repeat(64)} as never;store.plan(event,policy,"b".repeat(64),"city-a");store.plan(event,policy,"b".repeat(64),"city-a");expect(()=>store.plan(event,policy,"c".repeat(64),"city-b")).toThrow("limit");store.approve("b".repeat(64),signed);expect(store.get("b".repeat(64))).toEqual({eventId:"d".repeat(64),signedEvent:signed,state:"approved",detail:"signed"});db.close();});
});
