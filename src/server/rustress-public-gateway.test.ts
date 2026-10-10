import {DatabaseSync} from "node:sqlite";
import {createServer} from "node:http";
import {afterEach,describe,expect,it,vi} from "vitest";
import {createCityActivation} from "../rustress/activation-contract";
import type {ProvisionConfig} from "../rustress/contract";
import {loopbackApiTransport} from "../rustress/loopback-http";
import {installNamedIdentity,installSuperAdminRootIdentity} from "../rustress/public-identity-store";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";
import {installStandaloneAddress} from "../rustress/standalone-address-store";
import {gatewayTest,managedLnurl,managedNip05} from "./rustress-public-gateway";
const dbs:DatabaseSync[]=[];afterEach(()=>{dbs.forEach(db=>db.close());dbs.length=0;});
const reserved:ProvisionConfig={cityId:"00000000-0000-4000-8000-000000000001",version:1,domain:"bitcoinwalk.org",localPart:"madeira",brandPubkey:"a".repeat(64),authorityEventId:"b".repeat(64),approvalEventId:"c".repeat(64),brandEventId:"d".repeat(64),payoutVersion:1,payoutDestination:"organizer@example.org",walletRef:"bitcoinwalk-rustress",organizerBasisPoints:7900,retainedBasisPoints:2100,invoiceIssuance:"disabled"},active=createCityActivation(reserved);
function fixture(phase="verifying") {const db=new DatabaseSync(":memory:");dbs.push(db);db.exec("CREATE TABLE rustress_activation_task(activation_config TEXT,phase TEXT)");db.prepare("INSERT INTO rustress_activation_task VALUES(?,?)").run(JSON.stringify(active),phase);
  const transport=vi.fn<typeof fetch>(async url=>new Response(String(url).includes("nostr.json")?JSON.stringify({names:{madeira:active.brandPubkey}}):JSON.stringify({tag:"payRequest",callback:"https://bitcoinwalk.org/lnurlp/madeira/callback",metadata:"[]",minSendable:1000,maxSendable:100000}),{headers:{"Content-Type":"application/json"}}));
  return {db,transport,deps:{db,transport,origin:"http://127.0.0.1:18895"}};}
describe("managed public city gateway",()=>{
  it("serves only an applied activation and revalidates exact NIP-05 identity",async()=>{const f=fixture();const response=await managedNip05("madeira",f.deps);expect(response.status).toBe(200);expect(response.headers.get("access-control-allow-origin")).toBe("*");expect(await response.json()).toEqual({names:{madeira:active.brandPubkey}});expect(f.transport).toHaveBeenCalledWith(expect.stringContaining("nostr.json?name=madeira"),expect.objectContaining({redirect:"error",headers:expect.objectContaining({Host:"bitcoinwalk.org"})}));});
  it("does not expose queued, blocked, unknown or unrelated identities",async()=>{for(const phase of ["queued","blocked","unknown"]){const f=fixture(phase);expect(await (await managedNip05("madeira",f.deps)).json()).toEqual({names:{}});expect(f.transport).not.toHaveBeenCalled();}const f=fixture();expect(await (await managedNip05("other",f.deps)).json()).toEqual({names:{}});});
  it("proxies only bounded city LNURL paths without credentials",async()=>{const f=fixture("active"),response=await managedLnurl("madeira","/.well-known/lnurlp/madeira","",f.deps);expect(response.status).toBe(200);expect((await response.json()).tag).toBe("payRequest");expect(JSON.stringify(f.transport.mock.calls)).not.toContain("Authorization");expect((await managedLnurl("madeira","/v1/bitcoinwalk/capabilities","",f.deps)).status).toBe(404);expect((await managedLnurl("madeira","/lnurlp/../admin","",f.deps)).status).toBe(404);});
  it("fails closed on provider mismatch, oversized or unavailable responses",async()=>{const f=fixture();f.transport.mockResolvedValueOnce(new Response(JSON.stringify({names:{madeira:"b".repeat(64)}}),{headers:{"Content-Type":"application/json"}}));expect((await managedNip05("madeira",f.deps)).status).toBe(503);f.transport.mockRejectedValueOnce(new Error("offline"));expect((await managedLnurl("madeira","/lnurlp/madeira","",f.deps)).status).toBe(503);});
  it("suppresses both public capabilities when their operator gates are off",async()=>{const f=fixture("active"),deps={...f.deps,nip05Enabled:()=>false,lnurlEnabled:()=>false};
    expect(await (await managedNip05("madeira",deps)).json()).toEqual({names:{}});expect((await managedLnurl("madeira","/.well-known/lnurlp/madeira","",deps)).status).toBe(404);
    expect(f.transport).not.toHaveBeenCalled();});
  it("can publish NIP-05 while the Lightning address remains closed",async()=>{const f=fixture("active"),deps={...f.deps,nip05Enabled:()=>true,lnurlEnabled:()=>false};
    expect(await (await managedNip05("madeira",deps)).json()).toEqual({names:{madeira:active.brandPubkey}});
    expect((await managedLnurl("madeira","/.well-known/lnurlp/madeira","",deps)).status).toBe(404);
    expect(f.transport).toHaveBeenCalledTimes(1);expect(String(f.transport.mock.calls[0][0])).toContain("nostr.json");});
  it("publishes an imported identity without importing a payment activation",async()=>{const db=new DatabaseSync(":memory:");dbs.push(db);db.exec(`CREATE TABLE rustress_public_identity(
      local_part TEXT PRIMARY KEY,domain TEXT,brand_pubkey TEXT,evidence_hash TEXT,source_city TEXT,challenge TEXT,owner_proof TEXT,admin_proof TEXT,activation_config TEXT,activation_request TEXT,activation_proof TEXT,status TEXT,updated_at INTEGER)`);
    db.prepare("INSERT INTO rustress_public_identity VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run("madeira","bitcoinwalk.org",active.brandPubkey,"e".repeat(64),reserved.cityId,"{}","{}","{}","{}","request","proof","active",1);
    const transport=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({names:{madeira:active.brandPubkey}}),{headers:{"Content-Type":"application/json"}})),deps={db,transport,origin:"http://127.0.0.1:18895",nip05Enabled:()=>true,lnurlEnabled:()=>true};
    expect(await (await managedNip05("madeira",deps)).json()).toEqual({names:{madeira:active.brandPubkey}});
    expect((await managedLnurl("madeira","/.well-known/lnurlp/madeira","",deps)).status).toBe(404);});
  it("publishes the root super-admin identity without contacting a payment provider",async()=>{const db=new DatabaseSync(":memory:");dbs.push(db);expect(installSuperAdminRootIdentity(db).created).toBe(true);expect(installSuperAdminRootIdentity(db).created).toBe(false);
    const transport=vi.fn<typeof fetch>(),deps={db,transport,origin:"",nip05Enabled:()=>true,lnurlEnabled:()=>true};
    const response=await managedNip05("_",deps);expect(response.status).toBe(200);expect(response.headers.get("access-control-allow-origin")).toBe("*");expect(await response.json()).toEqual({names:{_:SUPER_ADMIN_PUBKEY}});
    expect((await managedLnurl("_","/.well-known/lnurlp/_","",deps)).status).toBe(404);expect(transport).not.toHaveBeenCalled();});
  it("publishes an exact named identity without creating an LNURL or contacting the provider",async()=>{const db=new DatabaseSync(":memory:");dbs.push(db);const pubkey="e".repeat(64);
    expect(installNamedIdentity(db,"endo",pubkey).created).toBe(true);expect(installNamedIdentity(db,"endo",pubkey).created).toBe(false);
    expect(()=>installNamedIdentity(db,"endo","f".repeat(64))).toThrow("differs");
    const transport=vi.fn<typeof fetch>(),deps={db,transport,origin:"",nip05Enabled:()=>true,lnurlEnabled:()=>true};
    const response=await managedNip05("endo",deps);expect(response.status).toBe(200);expect(response.headers.get("access-control-allow-origin")).toBe("*");expect(await response.json()).toEqual({names:{endo:pubkey}});
    expect((await managedLnurl("endo","/.well-known/lnurlp/endo","",deps)).status).toBe(404);expect(transport).not.toHaveBeenCalled();});
  it("can open the Lightning address independently without changing NIP-05",async()=>{const f=fixture("active"),deps={...f.deps,nip05Enabled:()=>false,lnurlEnabled:()=>true};
    expect(await (await managedNip05("madeira",deps)).json()).toEqual({names:{}});
    expect((await managedLnurl("madeira","/.well-known/lnurlp/madeira","",deps)).status).toBe(200);
    expect(f.transport).toHaveBeenCalledTimes(1);expect(String(f.transport.mock.calls[0][0])).toContain("lnurlp");});
  it("proxies an explicitly installed standalone address without inventing NIP-05",async()=>{const db=new DatabaseSync(":memory:");dbs.push(db);installStandaloneAddress(db,{version:1,domain:"bitcoinwalk.org",localPart:"donate",walletRef:"bitcoinwalk-rustress",receivingDestination:"bitcoinwalk@getalby.com",invoiceIssuance:"enabled"});
    const transport=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({tag:"payRequest",callback:"https://bitcoinwalk.org/lnurlp/donate/callback",metadata:"[]",minSendable:1000,maxSendable:1_000_000_000}),{headers:{"Content-Type":"application/json"}})),deps={db,transport,origin:"http://127.0.0.1:18895",nip05Enabled:()=>true,lnurlEnabled:()=>true};
    expect(await (await managedNip05("donate",deps)).json()).toEqual({names:{}});expect((await managedLnurl("donate","/.well-known/lnurlp/donate","",deps)).status).toBe(200);expect(transport).toHaveBeenCalledTimes(1);});
  it("keeps the legacy bounded activation switch compatible and requires the exact pilot mode",()=>{
    const previous={mode:process.env.BITCOINWALK_RUSTRESS_MANAGED_MADEIRA_PILOT,legacy:process.env.BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED,nip05:process.env.BITCOINWALK_RUSTRESS_NIP05_ENABLED,lnurl:process.env.BITCOINWALK_RUSTRESS_LNURL_ENABLED};
    try{process.env.BITCOINWALK_RUSTRESS_MANAGED_MADEIRA_PILOT="activation-v1";process.env.BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED="1";delete process.env.BITCOINWALK_RUSTRESS_NIP05_ENABLED;delete process.env.BITCOINWALK_RUSTRESS_LNURL_ENABLED;
      expect(gatewayTest.publicCapabilityEnabled("NIP05")).toBe(true);expect(gatewayTest.publicCapabilityEnabled("LNURL")).toBe(true);
      delete process.env.BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED;process.env.BITCOINWALK_RUSTRESS_NIP05_ENABLED="1";
      expect(gatewayTest.publicCapabilityEnabled("NIP05")).toBe(true);expect(gatewayTest.publicCapabilityEnabled("LNURL")).toBe(false);
      process.env.BITCOINWALK_RUSTRESS_MANAGED_MADEIRA_PILOT="reservation-v1";expect(gatewayTest.publicCapabilityEnabled("NIP05")).toBe(false);
    }finally{for(const [key,value] of Object.entries({BITCOINWALK_RUSTRESS_MANAGED_MADEIRA_PILOT:previous.mode,BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED:previous.legacy,BITCOINWALK_RUSTRESS_NIP05_ENABLED:previous.nip05,BITCOINWALK_RUSTRESS_LNURL_ENABLED:previous.lnurl}))value===undefined?delete process.env[key]:process.env[key]=value;}
  });
  it("preserves the canonical virtual host over a loopback-only transport",async()=>{
    const server=createServer((request,response)=>{response.setHeader("Content-Type","application/json");response.setHeader("Access-Control-Allow-Origin","*");response.end(JSON.stringify({host:request.headers.host}));});
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    try{const address=server.address();if(!address||typeof address==="string")throw new Error();
      const response=await gatewayTest.loopbackTransport(`http://127.0.0.1:${address.port}/.well-known/nostr.json?name=madeira`,{method:"GET",headers:{Host:"bitcoinwalk.org"}});
      expect(response.headers.get("access-control-allow-origin")).toBe("*");expect(await response.json()).toEqual({host:"bitcoinwalk.org"});
      await expect(gatewayTest.loopbackTransport(`http://localhost:${address.port}/`,{method:"GET",headers:{Host:"bitcoinwalk.org"}})).rejects.toThrow("invalid private provider request");
    }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
  it("preserves the virtual host and bounded authorization for the private API",async()=>{
    const server=createServer((request,response)=>{const chunks:Buffer[]=[];request.on("data",chunk=>chunks.push(Buffer.from(chunk)));request.on("end",()=>{response.setHeader("Content-Type","application/json");response.end(JSON.stringify({host:request.headers.host,authorization:request.headers.authorization,body:Buffer.concat(chunks).toString()}));});});
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    try{const address=server.address();if(!address||typeof address==="string")throw new Error();const origin=`http://127.0.0.1:${address.port}`,transport=loopbackApiTransport(origin,"bitcoinwalk.org"),token="a".repeat(43);
      const response=await transport(`${origin}/v1/bitcoinwalk/cities/00000000-0000-4000-8000-000000000001/prepare`,{method:"POST",headers:{Authorization:`Bearer ${token}`},body:"{}"});
      expect(await response.json()).toEqual({host:"bitcoinwalk.org",authorization:`Bearer ${token}`,body:"{}"});
      await expect(transport(`${origin}/admin`,{method:"GET",headers:{Authorization:`Bearer ${token}`}})).rejects.toThrow("invalid private provider API request");
    }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
});
