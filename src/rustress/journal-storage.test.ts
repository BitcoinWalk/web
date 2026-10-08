import {beforeEach,afterEach,describe,expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({real:vi.fn(),stat:vi.fn(),lstat:vi.fn()}));
vi.mock("node:fs",()=>({realpathSync:mock.real,statSync:mock.stat,lstatSync:mock.lstat}));
import {inspectJournalStorage} from "./journal-storage";
beforeEach(()=>{
 vi.spyOn(process,"getuid").mockReturnValue(1000);
 mock.real.mockReset().mockImplementation((path:string)=>path);
 mock.lstat.mockReset().mockReturnValue({isSymbolicLink:()=>false});
 mock.stat.mockReset().mockImplementation((path:string)=>({isFile:()=>path.endsWith(".sqlite"),isDirectory:()=>!path.endsWith(".sqlite"),uid:1000,nlink:1,mode:0o600,dev:path.startsWith("/journal")?2:1}));
});
afterEach(()=>vi.restoreAllMocks());
const check=()=>inspectJournalStorage("/ledger/private/state.sqlite","/journal/private/sends.sqlite");
describe("journal storage preflight (mocked topology, no mounts or provisioning)",()=>{
 it("recognizes separate private filesystems without granting activation",()=>{expect(check()).toEqual({state:"filesystem-separated",activationAllowed:false});});
 it("rejects a shared device",()=>{mock.stat.mockReturnValue({isFile:()=>true,isDirectory:()=>true,uid:1000,nlink:1,mode:0o600,dev:1});expect(check().state).toBe("blocked");});
 it("rejects root execution",()=>{vi.mocked(process.getuid!).mockReturnValue(0);expect(check().state).toBe("blocked");});
 it("rejects symlinked paths",()=>{mock.real.mockReturnValue("/other/state.sqlite");expect(check().state).toBe("blocked");});
 it.each([{uid:2000},{mode:0o644},{nlink:2}])("rejects unsafe ownership/access/links: %j",patch=>{
  const original=mock.stat.getMockImplementation()!;mock.stat.mockImplementation((path:string)=>({...original(path),...patch}));expect(check().state).toBe("blocked");
 });
 it("fails closed when storage is missing",()=>{mock.stat.mockImplementation(()=>{throw new Error("private path");});expect(check()).toEqual({state:"blocked",activationAllowed:false});});
});
