import {readFile} from "node:fs/promises";
import {describe,expect,it} from "vitest";

describe("published walk edit signing flow",()=>{
  it("asks the signer before the fresh relay access check and shows local progress",async()=>{
    const source=await readFile(new URL("./_screen.tsx",import.meta.url),"utf8");
    const start=source.indexOf("async function savePublishedEdit");
    const end=source.indexOf("function saveDraftEdit",start);
    const flow=source.slice(start,end);
    expect(start).toBeGreaterThan(-1);
    expect(flow.indexOf("signWithBrowserExtension(template)")).toBeGreaterThan(-1);
    expect(flow.indexOf("organizerPublishingStatus(relayConfig.writeRelays,owner)")).toBeGreaterThan(flow.indexOf("signWithBrowserExtension(template)"));
    expect(flow).toContain("Another walk action is still finishing");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("Complete or correct the highlighted field before signing.");
  });
});
