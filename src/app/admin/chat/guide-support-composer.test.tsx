import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import GuideSupportComposer from "./guide-support-composer";

it("shows private inbox discovery rather than silently hiding the composer",()=>{
 const html=renderToStaticMarkup(createElement(GuideSupportComposer,{guidePubkey:"a".repeat(64),actor:"b".repeat(64),onRefresh:()=>{}}));
 expect(html).toContain("Checking private messaging…");expect(html).toContain('role="status"');
 const source=readFileSync("src/app/admin/chat/guide-support-composer.tsx","utf8");
 expect(source).toContain("Retry private messaging");expect(source).toContain("setRetry(value=>value+1)");
 expect(source).toContain("[guidePubkey,actor,retry]");expect(source).toContain("if(active)setInboxError");
 expect(source).not.toContain(".catch(()=>{})");
});
it("does not offer messaging before an account and Guide identity are available",()=>{
 expect(renderToStaticMarkup(createElement(GuideSupportComposer,{guidePubkey:"",actor:"",onRefresh:()=>{}}))).toBe("");
});
