import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import GuideInboxFailures from "./guide-inbox-failures";

describe("Guide inbox failure details",()=>{
 it("shows correlatable envelope IDs and fixed failure descriptions only when needed",()=>{
  expect(renderToStaticMarkup(createElement(GuideInboxFailures,{failures:[]}))).toBe("");
  const id="e7c52860d120fa9c67627731758573ea8fd9019c4016a6fe873c94fc8ae1aaff";
  const html=renderToStaticMarkup(createElement(GuideInboxFailures,{failures:[{wrapId:id,stage:"message-decryption"}]}));
  expect(html).toContain(id);expect(html).toContain("signer could not decrypt the inner message");expect(html).toContain("<details>");
 });
});
