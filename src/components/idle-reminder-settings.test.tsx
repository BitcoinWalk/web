import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {IdleReminderSettingsView} from "./idle-reminder-settings";
const saved={preference:{enabled:true,snooze:0,version:1},paused:true,checkedAt:100};
const render=(overrides:Partial<Parameters<typeof IdleReminderSettingsView>[0]>={})=>renderToStaticMarkup(createElement(IdleReminderSettingsView,{saved,busy:null,message:"",error:"",onRequest:()=>{},...overrides}));
describe("reminder settings clarity",()=>{
 it("separates the saved On preference from paused delivery",()=>{const html=render();expect(html).toContain("Not sending — paused by BitcoinWalk");expect(html).toContain("Your saved preference");expect(html).toContain("even if your saved preference is On");expect(html).toContain("Changes save automatically here");expect(html).toContain("city-profile submission is needed");expect(html).not.toContain('type="submit"');});
 it("does not claim settings before checking them",()=>{const html=render({saved:null});expect(html).toContain("Status not checked");expect(html).toContain("Load saved preference");expect(html).not.toContain("<select");});
 it("distinguishes off, snoozed and eligible without promising an immediate message",()=>{expect(render({saved:{...saved,paused:false,preference:{...saved.preference,enabled:false}}})).toContain("you switched reminders off");expect(render({saved:{...saved,paused:false,preference:{...saved.preference,snooze:200}}})).toContain("Not sending — snoozed until");expect(render({saved:{...saved,paused:false}})).toContain("On does not send a message now");});
 it("shows saving, success and uncertain-error feedback beside the control",()=>{const saving=render({busy:"save"});expect(saving).toContain("Saving your preference");expect(saving).toContain("disabled");expect(render({message:"✓ Saved automatically. Nothing else to submit."})).toContain("Nothing else to submit");const error=render({saved:null,error:"Signer declined."});expect(error).toContain('role="alert"');expect(error).toContain("Reload saved preference");expect(error).not.toContain("Saved automatically");});
 it("isolates reminders from the profile form and keeps navigation available during review",()=>{const source=readFileSync("src/app/organizer/_screen.tsx","utf8");expect(source).toContain('hidden={workspaceTab!=="reminders"}');expect(source).toContain('hidden={workspaceTab!=="profile"}');expect(source.indexOf('aria-label="City settings"')).toBeLessThan(source.indexOf('{selectedCity&&!selectedCity.editable'));const panel=source.indexOf('<IdleReminderSettings');expect(panel).toBeLessThan(source.indexOf('<form className={styles.editorForm}'));});
});
