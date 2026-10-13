import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {parseChatPreviewHtml,safeChatPreviewUrl} from "./chat-link-preview";

describe("chat link previews",()=>{
 it("extracts bounded Open Graph metadata",()=>{expect(parseChatPreviewHtml('<html><head><meta content="Example &amp; Site" property="og:title"><meta property="og:description" content="A useful page"><meta property="og:image" content="/share.jpg"></head></html>',"https://example.org/post")).toEqual({url:"https://example.org/post",title:"Example & Site",description:"A useful page",image:"https://example.org/share.jpg",site:"example.org"});});
 it("rejects internal, credentialed and non-HTTPS targets",()=>{for(const value of ["http://example.org","https://user:pass@example.org","https://127.0.0.1/","https://app-staging.bitcoinwalk.org/admin"])expect(safeChatPreviewUrl(value)).toBeNull();expect(safeChatPreviewUrl("https://example.org/post")?.href).toBe("https://example.org/post");});
});
