import {describe,expect,it,vi} from "vitest";
import {retryDirectoryRead} from "./city-setup-evidence";

describe("city setup directory reads",()=>{
  it("retries one transient failure before returning exact evidence",async()=>{
    const operation=vi.fn().mockRejectedValueOnce(new Error("temporary outage")).mockResolvedValueOnce(["signed-root"]),wait=vi.fn().mockResolvedValue(undefined);
    await expect(retryDirectoryRead(operation,wait)).resolves.toEqual(["signed-root"]);
    expect(operation).toHaveBeenCalledTimes(2);expect(wait).toHaveBeenCalledWith(300);
  });
  it("preserves a repeated failure so quorum discovery still fails closed",async()=>{
    const failure=new Error("still unavailable"),operation=vi.fn().mockRejectedValue(failure);
    await expect(retryDirectoryRead(operation,async()=>{})).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
