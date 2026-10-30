import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {afterEach,describe,expect,it} from "vitest";

const dirs:string[]=[];
afterEach(()=>dirs.splice(0).forEach(path=>rmSync(path,{recursive:true,force:true})));
describe("web notification backup contract",()=>{
  it("fingerprints all private notification tables without exposing their rows",()=>{
    const directory=mkdtempSync(join(tmpdir(),"notification-backup-"));dirs.push(directory);const database=join(directory,"state.sqlite"),db=new DatabaseSync(database);
    db.exec("CREATE TABLE web_push_subscription(id TEXT);CREATE TABLE web_push_subscription_audit(id INTEGER);CREATE TABLE web_notification(id TEXT);CREATE TABLE web_notification_delivery(noticeId TEXT,deviceId TEXT);INSERT INTO web_push_subscription VALUES('private-endpoint')");db.close();
    const report=JSON.parse(execFileSync(process.execPath,[new URL("../../scripts/report-web-notification-state.mjs",import.meta.url).pathname,database],{encoding:"utf8"}));
    expect(report).toMatchObject({version:1,integrity:"ok",tables:{web_push_subscription:{rows:1},web_push_subscription_audit:{rows:0},web_notification:{rows:0},web_notification_delivery:{rows:0}}});
    expect(JSON.stringify(report)).not.toContain("private-endpoint");
  });
  it("keeps backup creation public-key-only and restore isolated",()=>{
    const backup=readFileSync(new URL("../../deploy/backup-web-notification-state.sh",import.meta.url),"utf8"),restore=readFileSync(new URL("../../deploy/verify-web-notification-backup.sh",import.meta.url),"utf8");
    expect(backup).toContain("Private backup keys are forbidden");expect(backup).toContain("backup-sqlite-online.mjs");expect(backup).toContain("EXPECTED_FINGERPRINT");
    expect(restore).toContain("Unexpected backup contents");expect(restore).toContain("live_database_unchanged=yes");expect(restore).not.toMatch(/UPDATE |INSERT |DELETE /);
  });
});
