import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("PWA lifecycle",()=>{
 it("registers a same-origin worker only in built releases and communicates offline safety",()=>{const source=readFileSync("src/components/pwa-lifecycle.tsx","utf8");expect(source).toContain('process.env.NODE_ENV!=="production"');expect(source).toContain('register("/sw.js",{scope:"/"})');expect(source).toContain("nothing will be submitted until you reconnect");expect(source).toContain("beforeinstallprompt");});
 it("keeps the service worker network-first and never stores fetched app or API responses",()=>{const source=readFileSync("public/sw.js","utf8");expect(source).toContain('const OFFLINE=["/offline","/pwa/icon-192.png","/pwa/icon-512.png"]');expect(source).toContain('request.mode!=="navigate"');expect(source).toContain("fetch(request).catch");expect(source).not.toContain("cache.put");expect(source).not.toContain('"/api/');});
 it("bounds push copy and accepts only same-origin relative paths",()=>{const source=readFileSync("public/sw.js","utf8");expect(source).toContain("title.slice(0,80)");expect(source).toContain("body.slice(0,180)");expect(source).toContain('candidate.startsWith("/")&&!candidate.startsWith("//")');});
});
