import {describe,expect,it} from "vitest";
import {GET} from "./route";

describe("Hosts universal link",()=>{it("falls back to the Hosts conversation in the web dashboard",()=>{const response=GET(new Request("https://bitcoinwalk.org/chat/hosts"));expect(response.status).toBe(307);expect(response.headers.get("location")).toBe("https://bitcoinwalk.org/admin/chat?room=hosts");});});
