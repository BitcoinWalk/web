import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import GuideProcessingStatus from "./guide-processing-status";
import type {GuideConversationMessage} from "../../../nostr/guide-processing";

it("labels the processing emoji accessibly and renders a failure instead of eyes",()=>{
 const message:GuideConversationMessage={id:"q",wrapId:"q",pubkey:"actor",recipient:"guide",content:"Bitcoin?",createdAt:1};
 expect(renderToStaticMarkup(createElement(GuideProcessingStatus,{message}))).toBe("");
 const working=renderToStaticMarkup(createElement(GuideProcessingStatus,{message:{...message,processingUntil:9999999999}}));
 expect(working).toContain("👀");expect(working).toContain('aria-label="Guide is working on this question"');
 const failed=renderToStaticMarkup(createElement(GuideProcessingStatus,{message:{...message,processingFailed:true}}));
 expect(failed).toContain("Please try again later");expect(failed).not.toContain("👀");
});
