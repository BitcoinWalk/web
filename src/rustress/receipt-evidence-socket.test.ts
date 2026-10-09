import {mkdtempSync,rmSync} from "node:fs";
import {createServer,request as httpRequest,type Server} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,describe,expect,it,vi} from "vitest";
import {receiptEvidenceSocketHandler} from "./receipt-evidence-socket";

const directories:string[]=[],servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));for(const path of directories.splice(0))rmSync(path,{recursive:true,force:true});});
function call(socket:string,path:string,method="POST",body:unknown={test:true},contentType="application/json"){
 const document=JSON.stringify(body);return new Promise<{status:number;body:Record<string,unknown>}>((resolve,reject)=>{const request=httpRequest({socketPath:socket,path,method,headers:{authorization:"Bearer "+"x".repeat(48),"content-type":contentType,"content-length":Buffer.byteLength(document)}},response=>{const chunks:Buffer[]=[];response.on("data",chunk=>chunks.push(Buffer.from(chunk)));response.on("end",()=>resolve({status:response.statusCode!,body:JSON.parse(Buffer.concat(chunks).toString("utf8"))}));response.on("error",reject);});request.on("error",reject);request.end(document);});
}
async function fixture(){const directory=mkdtempSync(join(tmpdir(),"evidence-boundary-")),socket=join(directory,"evidence.sock"),api={route:vi.fn(async()=>({status:200,body:{proof:true}}))},server=createServer(receiptEvidenceSocketHandler(api));directories.push(directory);servers.push(server);await new Promise<void>(resolve=>server.listen(socket,resolve));return {socket,api};}
describe("receipt evidence Unix boundary",()=>{
 it("forwards only the exact authenticated evidence route",async()=>{const f=await fixture();await expect(call(f.socket,"/v1/receipts/evidence")).resolves.toEqual({status:200,body:{proof:true}});expect(f.api.route).toHaveBeenCalledWith("POST","/v1/receipts/evidence","Bearer "+"x".repeat(48),{test:true});});
 it.each([["/v1/status","POST"],["/v1/invoices/issue","POST"],["/v1/receipts/evidence","GET"]])("does not expose %s %s",async(path,method)=>{const f=await fixture();await expect(call(f.socket,path,method)).resolves.toMatchObject({status:404});expect(f.api.route).not.toHaveBeenCalled();});
 it("rejects non-JSON and oversized input before the payout API",async()=>{const f=await fixture();await expect(call(f.socket,"/v1/receipts/evidence","POST",{},"text/plain")).resolves.toMatchObject({status:415});await expect(call(f.socket,"/v1/receipts/evidence","POST",{value:"x".repeat(17000)})).resolves.toMatchObject({status:400});expect(f.api.route).not.toHaveBeenCalled();});
});
