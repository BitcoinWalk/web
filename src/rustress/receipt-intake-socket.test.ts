import {mkdtempSync,rmSync} from "node:fs";
import {createServer,request,type Server} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,describe,expect,it,vi} from "vitest";
import {receiptIntakeHandler} from "./receipt-intake-socket";
import type {ZapReceiptAuthority} from "./zap-receipt-authority";

const servers:Server[]=[],directories:string[]=[],token="x".repeat(48);
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));directories.splice(0).forEach(path=>rmSync(path,{recursive:true,force:true}));});
async function fixture(){
 const directory=mkdtempSync(join(tmpdir(),"receipt-intake-")),socket=join(directory,"intake.sock");directories.push(directory);
 const enqueue=vi.fn(()=>({state:"prepared"}));
 const server=createServer(receiptIntakeHandler("ab".repeat(32),token,{enqueue} as unknown as ZapReceiptAuthority,()=>({mode:"fixture"})));servers.push(server);
 await new Promise<void>(resolve=>server.listen(socket,resolve));return {socket,enqueue};
}
function call(socket:string,path="/v1/receipts",body="{}",authorization=`Bearer ${token}`,contentType="application/json",method="POST"){
 return new Promise<number>((resolve,reject)=>{const req=request({socketPath:socket,path,method,headers:{authorization,"content-type":contentType,"content-length":Buffer.byteLength(body)}},res=>{res.resume();res.on("end",()=>resolve(res.statusCode!));res.on("error",reject);});req.on("error",reject);req.end(body);});
}
describe("private receipt intake",()=>{
 it("queues authenticated JSON without signing or issuing an invoice",async()=>{const f=await fixture();expect(await call(f.socket)).toBe(202);expect(f.enqueue).toHaveBeenCalledWith({});});
 it.each(["", "Bearer wrong", `Basic ${token}`])("rejects invalid authentication %s",async authorization=>{const f=await fixture();expect(await call(f.socket,"/v1/receipts","{}",authorization)).toBe(401);expect(f.enqueue).not.toHaveBeenCalled();});
 it("rejects malformed, oversized and non-JSON input before enqueue",async()=>{const f=await fixture();expect(await call(f.socket,"/v1/receipts","{" )).toBe(400);expect(await call(f.socket,"/v1/receipts",JSON.stringify({value:"x".repeat(99000)}))).toBe(400);expect(await call(f.socket,"/v1/receipts","{}",`Bearer ${token}`,"text/plain")).toBe(415);expect(f.enqueue).not.toHaveBeenCalled();});
 it("does not expose wallet or signing routes",async()=>{const f=await fixture();expect(await call(f.socket,"/v1/invoices/issue")).toBe(404);expect(await call(f.socket,"/v1/sign")).toBe(404);expect(await call(f.socket,"/v1/receipts","{}",`Bearer ${token}`,"application/json","GET")).toBe(404);expect(f.enqueue).not.toHaveBeenCalled();});
});
