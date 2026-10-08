import {describe,it,expect,vi} from "vitest";
import {SettlementCollector} from "./settlement-collector";
function fixture(enabled=true){
 const flow={collect:vi.fn(async()=>({state:"pending" as const})),sweep:vi.fn(async()=>({cursor:0,done:true,credited:0,pending:0,failed:0}))};
 const collector=new SettlementCollector(flow,()=>enabled);
 return {flow,collector,disable:()=>{enabled=false;}};
}
describe("default-off settlement collector",()=>{
 it("does no work without explicit activation",async()=>{
  const f=fixture(),c=new SettlementCollector(f.flow);expect(c.hint("ab".repeat(32))).toBe(false);
  expect(await c.poll()).toEqual({state:"paused"});expect(f.flow.sweep).not.toHaveBeenCalled();
 });
 it("deduplicates bounded hints and still sweeps missed notifications",async()=>{
  const f=fixture();f.collector.hint("ab".repeat(32));f.collector.hint("ab".repeat(32));
  expect(f.collector.hint("bad")).toBe(false);await f.collector.poll();expect(f.flow.collect).toHaveBeenCalledTimes(1);expect(f.flow.sweep).toHaveBeenCalledWith(0,50);
 });
 it("keeps scanning after a failed hint and resets completed cursor",async()=>{
  const f=fixture();f.flow.collect.mockRejectedValueOnce(new Error("secret"));f.collector.hint("ab".repeat(32));
  expect(await f.collector.poll(100)).toMatchObject({state:"scanned",cursor:0,done:true});expect(f.flow.sweep).toHaveBeenCalledWith(100,50);
 });
 it("limits pages and exposes continuation without pretending completeness",async()=>{
  const f=fixture();f.flow.sweep.mockResolvedValue({cursor:50,done:false,credited:2,pending:3,failed:1});
  expect(await f.collector.poll(0,1)).toMatchObject({cursor:50,done:false,credited:2,failed:1});expect(f.flow.sweep).toHaveBeenCalledTimes(1);
 });
 it("redacts failure and permits later retry",async()=>{
  const f=fixture();f.flow.sweep.mockRejectedValueOnce(new Error("secret"));expect(await f.collector.poll()).toEqual({state:"unconfirmed",cursor:0});
  expect(await f.collector.poll()).toMatchObject({state:"scanned"});
 });
 it("stops on disable and rejects excessive work",async()=>{
  const f=fixture();await expect(f.collector.poll(0,21)).rejects.toThrow("bounds");f.disable();expect(await f.collector.poll()).toEqual({state:"paused"});
 });
 it("prevents concurrent scans",async()=>{
  const f=fixture();let release!:()=>void;
  f.flow.sweep.mockImplementationOnce(async()=>{await new Promise<void>(r=>{release=r;});return {cursor:0,done:true,credited:0,pending:0,failed:0};});
  const first=f.collector.poll();expect(await f.collector.poll()).toEqual({state:"paused"});release();await first;
 });
});
