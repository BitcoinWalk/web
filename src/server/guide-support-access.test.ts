import {describe,expect,it,vi} from "vitest";
import {guideSupportPlan} from "./guide-support-access";

vi.mock("./pro-setup",()=>({proSetupDependencies:{grants:vi.fn()},resolveProSetupAuthority:vi.fn()}));
const owner="a".repeat(64),editor="b".repeat(64),grant={cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",creatorPubkey:owner,editorPubkeys:[owner,editor]};
describe("Guide Pro verification",()=>{
 it("requires independently verified current Pro authority for an owner or editor",async()=>{const deps={grants:vi.fn(async()=>[{grant}]),resolve:vi.fn(async()=>({grant:{grant}}))};expect(await guideSupportPlan(owner,deps as never)).toBe("pro");expect(await guideSupportPlan(editor,deps as never)).toBe("pro");expect(await guideSupportPlan("c".repeat(64),deps as never)).toBe("basic");});
 it("does not grant Pro for a requested plan or a removed editor",async()=>{const deps={grants:vi.fn(async()=>[{grant}]),resolve:vi.fn().mockRejectedValue(new Error("A settled Pro entitlement is required."))};expect(await guideSupportPlan(owner,deps as never)).toBe("basic");deps.resolve.mockResolvedValue({grant:{grant:{...grant,editorPubkeys:[owner]}}});expect(await guideSupportPlan(editor,deps as never)).toBe("basic");});
 it("fails closed when authority cannot be read",async()=>{const deps={grants:vi.fn(async()=>[{grant}]),resolve:vi.fn().mockRejectedValue(new Error("Relay timeout"))};await expect(guideSupportPlan(owner,deps as never)).rejects.toThrow("Relay timeout");});
});
