import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {cityHeroPrompt} from "./image-generator";
describe("city hero prompt",()=>{it("binds place context and excludes people and branding",()=>{const prompt=cityHeroPrompt({cityName:"Memphis",latitude:35.1495,longitude:-90.049,meetingPoint:"Coffee shop"});expect(prompt).toContain("Memphis");expect(prompt).toContain("35.14950, -90.04900");expect(prompt).toContain("No people");expect(prompt).toContain("No people, crowds, faces, bodies, text, logos, Bitcoin symbols");});});
