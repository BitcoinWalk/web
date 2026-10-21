import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {ChatRoomInfo,ChatComposerTips} from "./chat-chrome";

describe("quiet chat chrome",()=>{
 it("keeps room identity and count visible but technical and privacy details collapsed",()=>{
  const html=renderToStaticMarkup(createElement(ChatRoomInfo,{label:"Madeira",name:"BitcoinWalk Madeira",participants:4,relay:"wss://chat.bitcoinwalk.org/"}));
  const [visible,details]=html.split("<details");
  expect(visible).toContain("Madeira");expect(visible).toContain("4 participants");expect(visible).not.toContain("wss:");expect(details).not.toMatch(/^ open/);
  expect(details).toContain("Chat info");expect(details).toContain("wss://chat.bitcoinwalk.org/");expect(details).toContain("not end-to-end encrypted");
 });
 it("retains members-only and encrypted-inbox distinctions",()=>{
  const hosts=renderToStaticMarkup(createElement(ChatRoomInfo,{label:"Hosts",participants:1,privateGroup:true}));
  expect(hosts).toContain("1 participant");expect(hosts).toContain("Members only");expect(hosts).toContain("not end-to-end encrypted");
  const guide=renderToStaticMarkup(createElement(ChatRoomInfo,{label:"BitcoinWalk Guide",guide:true}));
  expect(guide).toContain("Encrypted messages");expect(guide).toContain("End-to-end encrypted NIP-17");expect(guide).not.toContain("not end-to-end encrypted");
 });
 it("keeps keyboard and draft help behind a native keyboard-accessible disclosure",()=>{
  const html=renderToStaticMarkup(createElement(ChatComposerTips));
  expect(html).toContain('aria-label="Message tips"');expect(html).not.toContain("<details open");
  for(const text of ["Drafts and photos stay with this account and chat","Enter to send","Shift+Enter","Type @"])expect(html).toContain(text);
 });
});
