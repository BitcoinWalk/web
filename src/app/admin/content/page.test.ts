import {describe,expect,it} from "vitest";
import {DEFAULT_FEATURE_FLAGS} from "../../../domain/feature-flags";
import {DEFAULT_HOME_PAGE} from "../../../domain/content";
import {contentTabFromLocation,hasContentChanges,hasFeatureFlagChanges} from "./page";

describe("Content administration state",()=>{
 it("supports stable direct links to Pages and Features",()=>{
  expect(contentTabFromLocation("?tab=features")).toBe("features");
  expect(contentTabFromLocation("?tab=pages")).toBe("pages");
  expect(contentTabFromLocation("?tab=unknown")).toBe("pages");
 });
 it("warns only after an actual page change",()=>{
  const original={...DEFAULT_HOME_PAGE},editor={page:{...original},original,revisionId:"revision"};
  expect(hasContentChanges(editor)).toBe(false);
  expect(hasContentChanges({...editor,page:{...editor.page,title:"Changed"}})).toBe(true);
  expect(hasContentChanges(null)).toBe(false);
 });
 it("detects only actual feature changes",()=>{
  expect(hasFeatureFlagChanges({...DEFAULT_FEATURE_FLAGS},{...DEFAULT_FEATURE_FLAGS})).toBe(false);
  expect(hasFeatureFlagChanges({...DEFAULT_FEATURE_FLAGS,sponsorships:!DEFAULT_FEATURE_FLAGS.sponsorships},{...DEFAULT_FEATURE_FLAGS})).toBe(true);
 });
});
