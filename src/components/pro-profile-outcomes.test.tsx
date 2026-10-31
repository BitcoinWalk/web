import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,it,expect} from "vitest";
import ProProfileOutcomeCheck,{ProCommunityHandoffCounts,ProProfileOutcomeCounts} from "./pro-profile-outcomes";
describe("Pro profile completion reporting",()=>{
 it("does not show invented zeroes before a check or imply app installation",()=>{const html=renderToStaticMarkup(createElement(ProProfileOutcomeCheck,{actor:"a".repeat(64)}));expect(html).toContain("Not checked yet");expect(html).toContain("Separate from the 90-day");expect(html).toContain("does not prove app installation");expect(html).not.toContain("<strong>0</strong>");});
 it("labels current checked results and unknown evidence",()=>{const html=renderToStaticMarkup(createElement(ProProfileOutcomeCounts,{report:{checked:4,complete:1,actionRequired:2,unknown:1,checkedAt:100}}));expect(html).toContain("Profiles verified complete");expect(html).toContain("Unknown");expect(html).toContain("not a historical completion total");});
 it("labels exact roster evidence without claiming activity",()=>{const html=renderToStaticMarkup(createElement(ProCommunityHandoffCounts,{report:{checked:4,confirmed:1,actionRequired:2,unknown:1,checkedAt:100}}));expect(html).toContain("Confirmed community handoff");expect(html).toContain("Owners in city community");expect(html).toContain("signed roster evidence");expect(html).not.toContain("installed");});
});
