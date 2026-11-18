import {it,expect,vi} from "vitest";
vi.mock("node:fs",()=>({copyFileSync:vi.fn(),chownSync:vi.fn(),chmodSync:vi.fn()}));
import {copyFileSync,chownSync,chmodSync} from "node:fs";
import {installGuideRootFile} from "./install-root-file";

it("explicitly sets root ownership after copying and before setting final permissions",()=>{
 installGuideRootFile("source","destination",0o755);
 expect(copyFileSync).toHaveBeenCalledWith("source","destination");
 expect(chownSync).toHaveBeenCalledWith("destination",0,0);
 expect(chmodSync).toHaveBeenCalledWith("destination",0o755);
 expect(vi.mocked(copyFileSync).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(chownSync).mock.invocationCallOrder[0]);
 expect(vi.mocked(chownSync).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(chmodSync).mock.invocationCallOrder[0]);
});

it("fails closed if root ownership cannot be established",()=>{
 vi.clearAllMocks();
 vi.mocked(chownSync).mockImplementationOnce(()=>{throw new Error("ownership denied");});
 expect(()=>installGuideRootFile("source","destination",0o755)).toThrow("ownership denied");
 expect(chmodSync).not.toHaveBeenCalled();
});
