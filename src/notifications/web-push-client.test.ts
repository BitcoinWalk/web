import {describe,expect,it} from "vitest";
import {explainWebPushError} from "./web-push-client";

describe("web push client recovery",()=>{
 it("turns Brave's opaque transport failure into exact recovery steps",()=>{expect(explainWebPushError(new DOMException("Registration failed - push service error","AbortError"),true)).toContain("brave://settings/privacy");expect(explainWebPushError(new Error("Registration failed - push service error"),true)).toContain("Nothing was saved");});
 it("keeps a useful transport recovery for other browsers",()=>{expect(explainWebPushError(new Error("Registration failed - push service error"),false)).toContain("relaunch the browser");});
 it("preserves unrelated failures",()=>{expect(explainWebPushError(new Error("Signer unavailable"),true)).toBe("Signer unavailable");});
});
