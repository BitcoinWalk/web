import {describe,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({redirect:vi.fn(()=>{throw new Error("NEXT_REDIRECT");})}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));
import GuidePage from "./page";

describe("Guide dashboard entry",()=>{it("sends old links to the Guide conversation inside Chat",()=>{const html=renderToStaticMarkup(createElement(GuidePage));expect(html).toContain("Dashboard moved");expect(html).toContain("/admin/chat?room=guide");expect(html).not.toContain("private conversation");});});
