import {afterEach,describe,expect,it,vi} from "vitest";
import {chmod,rm,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {loadReplicationStatus} from "./replication-status";

const token="a".repeat(64);
const tokenFile=join(tmpdir(),`bitcoinwalk-replication-status-${process.pid}`);
const report={version:1,state:"degraded",reconciled:true,cities:[{cityId:"586c0d1f-e861-4c8f-858c-ce3e2bfaf384",destination:"wss://replica-firstwalk-staging.bitcoinwalk.org/",state:"degraded",counts:{retry:1}}]};

afterEach(async()=>{vi.unstubAllGlobals();delete process.env.REPLICATION_STATUS_TOKEN_FILE;delete process.env.CREDENTIALS_DIRECTORY;await rm(tokenFile,{force:true});});

describe("replication status bridge",()=>{
 it("fails closed without the server-only token",async()=>{await expect(loadReplicationStatus()).rejects.toThrow("not configured");});
 it("authenticates to loopback with an owner-only credential and validates the content-free report",async()=>{await writeFile(tokenFile,`${token}\n`,{mode:0o600});process.env.REPLICATION_STATUS_TOKEN_FILE=tokenFile;const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify(report),{status:200,headers:{"Content-Type":"application/json"}}));vi.stubGlobal("fetch",fetchMock);await expect(loadReplicationStatus()).resolves.toEqual(report);expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3334/replication/status",expect.objectContaining({headers:{Authorization:`Bearer ${token}`}}));});
 it("rejects a credential readable by group or others",async()=>{await writeFile(tokenFile,`${token}\n`,{mode:0o600});await chmod(tokenFile,0o640);process.env.REPLICATION_STATUS_TOKEN_FILE=tokenFile;await expect(loadReplicationStatus()).rejects.toThrow("permissions");});
 it("accepts systemd-managed credential metadata",async()=>{await writeFile(tokenFile,`${token}\n`,{mode:0o600});await chmod(tokenFile,0o640);process.env.REPLICATION_STATUS_TOKEN_FILE=tokenFile;process.env.CREDENTIALS_DIRECTORY=tmpdir();const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify(report),{status:200}));vi.stubGlobal("fetch",fetchMock);await expect(loadReplicationStatus()).resolves.toEqual(report);});
 it("rejects an event-ID leak from the relay response",async()=>{await writeFile(tokenFile,token,{mode:0o600});process.env.REPLICATION_STATUS_TOKEN_FILE=tokenFile;vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({...report,eventId:"b".repeat(64)}),{status:200})));await expect(loadReplicationStatus()).rejects.toThrow();});
});
