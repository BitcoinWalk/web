import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("../../../../domain/media-request",()=>({parseMediaRequest:vi.fn()}));
vi.mock("../../../../domain/brand-studio-access",()=>({brandStudioAccess:vi.fn()}));
vi.mock("../../../../nostr/city-records",()=>({queryAuthorizations:vi.fn(),queryDirectoryRecords:vi.fn()}));
vi.mock("../../../../lib/server-relay-config",()=>({serverReadRelays:()=>["wss://relay.example"]}));
import {parseMediaRequest} from "../../../../domain/media-request";
import {brandStudioAccess} from "../../../../domain/brand-studio-access";
import {queryAuthorizations,queryDirectoryRecords} from "../../../../nostr/city-records";
import {POST} from "./route";

const event={pubkey:"a".repeat(64)};
const request=()=>new Request("https://bitcoinwalk.org/api/brand/access",{method:"POST",body:JSON.stringify({event})});

describe("brand studio access API",()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.mocked(queryDirectoryRecords).mockResolvedValue({revisions:[],approvals:[]});vi.mocked(queryAuthorizations).mockResolvedValue([]);});
 it("rejects anything other than the exact signed access command",async()=>{vi.mocked(parseMediaRequest).mockReturnValue(null);const response=await POST(request());expect(response.status).toBe(401);expect(queryDirectoryRecords).not.toHaveBeenCalled();});
 it("returns the server-derived access decision without caching",async()=>{vi.mocked(parseMediaRequest).mockReturnValue({action:"brand-studio-access"});vi.mocked(brandStudioAccess).mockReturnValue({allowed:false,role:"none",cities:[]});const response=await POST(request());expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");expect(await response.json()).toEqual({allowed:false,role:"none",cities:[]});});
});
