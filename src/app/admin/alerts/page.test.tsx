import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("operations alerts",()=>{
 it("shows human city labels and one safe next action for each alert type",()=>{const source=readFileSync("src/app/admin/alerts/page.tsx","utf8");expect(source).toContain("dashboard / operations / alerts");expect(source).toContain("dashboard.cities.find");expect(source).toContain("Open <Link href=\"/admin/monitoring/relays\">Relays</Link>");expect(source).toContain("Do not recreate or activate infrastructure from an alert.");expect(source).toContain("Open <Link href=\"/admin/content\">Content</Link>");});
});
