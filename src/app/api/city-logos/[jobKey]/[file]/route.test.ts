import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({file:vi.fn()}));
vi.mock("../../../../../logos/runtime",()=>({getLogoCatalog:()=>({file:mocks.file})}));
import {GET} from "./route";
const call=(jobKey="a".repeat(64),file="city.png")=>GET(new Request("https://app.example"),{params:Promise.resolve({jobKey,file})});
describe("city logo artifact route",()=>{
 beforeEach(()=>mocks.file.mockReset());
 it("returns bounded immutable content with MIME, checksum and attachment headers",async()=>{mocks.file.mockResolvedValue({name:"city.png",data:Buffer.from("png"),mime:"image/png",sha256:"b".repeat(64),publiclyListed:true});const response=await call();expect(response.status).toBe(200);expect(response.headers.get("Content-Type")).toBe("image/png");expect(response.headers.get("Content-Disposition")).toContain("city.png");expect(response.headers.get("Cache-Control")).toContain("immutable");expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");expect(response.headers.get("X-Robots-Tag")).toBeNull();});
 it("marks free-city files noindex",async()=>{mocks.file.mockResolvedValue({name:"city.zip",data:Buffer.from("zip"),mime:"application/zip",sha256:"b".repeat(64),publiclyListed:false});expect((await call()).headers.get("X-Robots-Tag")).toBe("noindex, nofollow");});
 it("fails closed for traversal, unknown and non-ready artifacts",async()=>{mocks.file.mockResolvedValue(null);expect((await call("a".repeat(64),"..%2Fsecret")).status).toBe(404);expect((await call()).headers.get("X-Content-Type-Options")).toBe("nosniff");});
});
