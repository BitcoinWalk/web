import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import ChatAppPromotion from "./chat-app-promotion";

describe("Chat app promotion",()=>{
 it("offers a truthful exact-room handoff without claiming the app is installed",()=>{
  const html=renderToStaticMarkup(createElement(ChatAppPromotion,{canonicalPath:"/chat/madeira",roomLabel:"BitcoinWalk Madeira"}));
  expect(html).toContain("Use on your phone");
  expect(html).toContain("opens safely in the browser today");
  expect(html).toContain("Get the app");
  expect(html).not.toContain("Open app");
 });
});
