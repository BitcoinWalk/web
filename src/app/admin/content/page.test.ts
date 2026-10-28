import {describe,expect,it} from "vitest";
import {DEFAULT_FEATURE_FLAGS} from "../../../domain/feature-flags";
import {DEFAULT_HOME_PAGE} from "../../../domain/content";
import {contentTabFromLocation,hasContentChanges,hasFeatureFlagChanges,retainedContentSuccess} from "./page";

describe("Content administration state",()=>{
 it("supports stable direct links to Pages and Features",()=>{
  expect(contentTabFromLocation("?tab=features")).toBe("features");
  expect(contentTabFromLocation("?tab=og-images")).toBe("og-images");
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
 it("retains a recent success through reload and expires stale or malformed notices",()=>{
  const now=1_800_000_000_000;
  expect(retainedContentSuccess(JSON.stringify({message:"Published.",at:now-60_000}),now)).toBe("Published.");
  expect(retainedContentSuccess(JSON.stringify({message:"Published.",at:now-10*60_000}),now)).toBeNull();
  expect(retainedContentSuccess(JSON.stringify({message:"Published.",at:now+1}),now)).toBeNull();
  expect(retainedContentSuccess(JSON.stringify({message:"",at:now}),now)).toBeNull();
  expect(retainedContentSuccess("not-json",now)).toBeNull();
 });
});
