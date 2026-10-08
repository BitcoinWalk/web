import {EventEmitter} from "node:events";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({dns:vi.fn(),request:vi.fn()}));
vi.mock("node:dns/promises",()=>({lookup:mocks.dns}));
vi.mock("node:https",()=>({request:mocks.request}));
import {recipientJson} from "./recipient-invoice";
let response:EventEmitter&{statusCode:number;headers:Record<string,string>;destroy:ReturnType<typeof vi.fn>};
let req:EventEmitter&{destroy:ReturnType<typeof vi.fn>;end:ReturnType<typeof vi.fn>};
beforeEach(()=>{
 vi.useFakeTimers();mocks.dns.mockReset().mockResolvedValue([{address:"8.8.8.8",family:4}]);mocks.request.mockReset();
 response=Object.assign(new EventEmitter(),{statusCode:200,headers:{"content-type":"application/json"},destroy:vi.fn()});
 req=Object.assign(new EventEmitter(),{destroy:vi.fn(),end:vi.fn()});
 mocks.request.mockImplementation((_options,callback)=>{req.end.mockImplementation(()=>callback(response));return req;});
});
afterEach(()=>vi.useRealTimers());
const url=new URL("https://wallet.example/pay");
async function started(){const promise=recipientJson(url);await Promise.resolve();return {promise};}
describe("pinned HTTPS recipient transport without live network",()=>{
 it("pins DNS while retaining the TLS hostname and parses bounded JSON",async()=>{
  const {promise}=await started();const options=mocks.request.mock.calls[0][0],cb=vi.fn();
  options.lookup("wallet.example",{},cb);expect(cb).toHaveBeenCalledWith(null,"8.8.8.8",4);
  expect(options).toMatchObject({hostname:"wallet.example",agent:false,method:"GET"});
  response.emit("data",Buffer.from('{"ok":true}'));response.emit("end");expect(await promise).toEqual({ok:true});
 });
 it("rejects mixed public/private DNS before HTTP",async()=>{
  mocks.dns.mockResolvedValue([{address:"8.8.8.8"},{address:"127.0.0.1"}]);
  await expect(recipientJson(url)).rejects.toThrow("unavailable");expect(mocks.request).not.toHaveBeenCalled();
 });
 it("bounds stalled DNS and never connects after the deadline",async()=>{
  let resolve!:(value:unknown)=>void;mocks.dns.mockImplementation(()=>new Promise(r=>{resolve=r;}));
  const promise=recipientJson(url);const rejected=expect(promise).rejects.toThrow("unavailable");
  await vi.advanceTimersByTimeAsync(7001);await rejected;resolve([{address:"8.8.8.8"}]);await Promise.resolve();expect(mocks.request).not.toHaveBeenCalled();
 });
 it("bounds the entire response even if data keeps arriving",async()=>{
  const {promise}=await started();const rejected=expect(promise).rejects.toThrow("unavailable");
  response.emit("data",Buffer.from("{"));await vi.advanceTimersByTimeAsync(7001);await rejected;expect(req.destroy).toHaveBeenCalled();
 });
 it.each([302,403,500])("never follows HTTP %s",async code=>{
  response.statusCode=code;await expect(recipientJson(url)).rejects.toThrow("unavailable");expect(mocks.request).toHaveBeenCalledTimes(1);
 });
 it.each(["type","encoding","large","invalid","aborted"])("rejects %s responses",async kind=>{
  if(kind==="type")response.headers["content-type"]="text/html";
  if(kind==="encoding")response.headers["content-encoding"]="gzip";
  const {promise}=await started();const rejected=expect(promise).rejects.toThrow("unavailable");
  if(kind==="large")response.emit("data",Buffer.alloc(65537));
  if(kind==="invalid"){response.emit("data",Buffer.from("secret-invalid"));response.emit("end");}
  if(kind==="aborted")response.emit("aborted");await rejected;
 });
});
