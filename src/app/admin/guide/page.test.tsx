import {describe,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({redirect:vi.fn(()=>{throw new Error("NEXT_REDIRECT");})}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));
import GuidePage from "./page";

describe("retired Guide dashboard entry",()=>{it("redirects the redundant page into Chat",()=>{expect(()=>GuidePage()).toThrow("NEXT_REDIRECT");expect(mocks.redirect).toHaveBeenCalledWith("/admin/chat");});});
