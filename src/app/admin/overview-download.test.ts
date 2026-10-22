import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("dashboard Walkie Talkie download",()=>{
 it("shows every signed-in role the stable Walkie Talkie download action",()=>{
  const page=readFileSync("src/app/admin/page.tsx","utf8");
  expect(page).toContain("Walkie Talkie");
  expect(page).toContain("QRCodeSVG");
  expect(page).toContain('value={WALKIE_TALKIE_DOWNLOAD_URL}');
  expect(page).toContain("Scan to download");
  expect(page).toContain("https://bitcoinwalk.org/app");
  expect(page).toContain('aria-label="Download Walkie Talkie"');
  expect(page).toContain('target="_blank"');
  expect(page).toContain('rel="noopener noreferrer"');
  expect(page.indexOf('session.role==="organizer"&&<OrganizerProNextAction/>')).toBeLessThan(page.indexOf('className={styles.walkieDownload}'));
 });
});
