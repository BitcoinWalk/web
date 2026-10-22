import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("dashboard Walkie Talkie download",()=>{
 it("shows every signed-in role the stable Walkie Talkie download action",()=>{
  const page=readFileSync("src/app/admin/page.tsx","utf8");
  expect(page).toContain("Get your BitcoinWalk companion app");
  expect(page).toContain("Download on Zapstore");
  expect(page).toContain("QRCodeSVG");
  expect(page).toContain('value={WALKIE_TALKIE_DOWNLOAD_URL}');
  expect(page).not.toContain("walkie-talkie-zapstore-icon.png");
  expect(page).toContain("https://bitcoinwalk.org/app");
  expect(page).toContain('aria-label="Get your BitcoinWalk companion app"');
  expect(page).toContain('target="_blank"');
  expect(page).toContain('rel="noopener noreferrer"');
  expect(page.indexOf('className={styles.overviewHeader}')).toBeLessThan(page.indexOf('session.role==="organizer"&&<OrganizerProNextAction/>'));
  expect(page.indexOf('className={styles.walkieDownload}')).toBeGreaterThan(page.indexOf('className={styles.overviewHeader}'));
 });
});
