import {mkdtempSync,rmSync,writeFileSync,chmodSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,beforeEach,describe,expect,it} from "vitest";
import {PaymentStore} from "../../../../payments/service";
import {RelayProvisionStore} from "../../../../relay-provisioning/store";
import {resetRelayProvisionRuntime} from "../../../../relay-provisioning/runtime";
import {GET,POST} from "./route";

const cityId="e62592ac-a5fc-42df-8f31-94416f6ee8d5",token="A".repeat(48),revisionId="ab".repeat(32),approvalEventId="cd".repeat(32),paymentHash="ef".repeat(32);
let directory="",database="",tokenFile="";
beforeEach(()=>{directory=mkdtempSync(join(tmpdir(),"bw-relay-worker-"));database=join(directory,"payments.db");tokenFile=join(directory,"token");writeFileSync(tokenFile,token+"\n",{mode:0o600});chmodSync(tokenFile,0o600);process.env.BITCOINWALK_PAYMENT_DATABASE=database;process.env.BITCOINWALK_RELAY_PROVISION_TOKEN_FILE=tokenFile;const payment=new PaymentStore(database);payment.db.prepare("INSERT INTO paid_city_entitlement VALUES(?,?,?,?,?)").run(cityId,"owner",paymentHash,"invoice",1);new RelayProvisionStore(payment.db).enqueue({cityId,revisionId,slug:"graz",cityName:"Graz",approvalEventId});payment.db.close();});
afterEach(()=>{resetRelayProvisionRuntime();delete process.env.BITCOINWALK_PAYMENT_DATABASE;delete process.env.BITCOINWALK_RELAY_PROVISION_TOKEN_FILE;rmSync(directory,{recursive:true,force:true});});
const request=(method="GET",body?:unknown,authorization=`Bearer ${token}`)=>new Request("https://bitcoinwalk.org/api/internal/city-relays",{method,headers:{authorization,...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});

describe("city relay worker API",()=>{
 it("requires the owner-only bearer credential and leases one bounded manifest",async()=>{expect((await GET(request("GET",undefined,"Bearer wrong"))).status).toBe(401);const response=await GET(request()),body=await response.json();expect(response.status).toBe(200);expect(body.manifest).toMatchObject({version:1,cityId,slug:"graz",destination:"wss://graz.bitcoinwalk.org/",approvalEventId,entitlementId:paymentHash});expect(body.manifest).not.toHaveProperty("invoice");expect((await GET(request())).status).toBe(204);});
 it("accepts only complete committed evidence for the active lease",async()=>{const claim=await (await GET(request())).json(),manifest=claim.manifest;const incomplete=await POST(request("POST",{cityId,evidenceDigest:manifest.evidenceDigest,phase:"provisioned",evidence:{containerNonRoot:true}}));expect(incomplete.status).toBe(409);const evidence={containerNonRoot:true,readOnly:true,noPublishedPorts:true,restartStable:true,emptyExact:true,gatewayRouted:true};const accepted=await POST(request("POST",{cityId,evidenceDigest:manifest.evidenceDigest,phase:"provisioned",evidence}));expect(accepted.status).toBe(200);expect(await accepted.json()).toEqual({cityId,phase:"provisioned"});});
});
