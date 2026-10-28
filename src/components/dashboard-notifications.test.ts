import {describe,expect,it,vi} from "vitest";
import {upsertDashboardNotification,type DashboardNotification} from "./dashboard-notifications";

const notice=(id:string,tone:DashboardNotification["tone"]="success",createdAt=1):DashboardNotification=>({id,tone,title:id,message:`${id} message`,createdAt});

describe("dashboard notifications",()=>{
 it("deduplicates the exact same outcome without re-announcing it",()=>{const current=[notice("saved")];expect(upsertDashboardNotification(current,{id:"saved",tone:"success",title:"saved",message:"saved message"},2)).toBe(current);});
 it("updates a changed outcome under the same stable id",()=>{const next=upsertDashboardNotification([notice("publish","warning")],{id:"publish",tone:"success",title:"Published",message:"Relay read-back confirmed."},2);expect(next).toEqual([{id:"publish",tone:"success",title:"Published",message:"Relay read-back confirmed.",createdAt:2}]);});
 it("bounds the stack while preserving the newest failure",()=>{const current=[notice("error","error",1),notice("one","success",2),notice("two","warning",3),notice("three","success",4)];const next=upsertDashboardNotification(current,{id:"four",tone:"success",title:"four",message:"four message"},5);expect(next).toHaveLength(4);expect(next.some(item=>item.id==="error")).toBe(true);expect(next.some(item=>item.id==="one")).toBe(false);});
 it("retains an action callback without executing it",()=>{const run=vi.fn(),next=upsertDashboardNotification([],{id:"retry",tone:"error",title:"Not published",message:"Retry safely.",action:{label:"Retry",run}},2);expect(next[0].action?.label).toBe("Retry");expect(run).not.toHaveBeenCalled();});
});
