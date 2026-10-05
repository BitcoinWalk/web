import {describe,it,expect} from "vitest";
import {cityPreview,previewText,walkPreview} from "./share-preview";
const input={city:"Barcelona",start:Date.parse("2026-10-10T08:00:00Z")/1000,end:Date.parse("2026-10-10T09:00:00Z")/1000,timeZone:"Europe/Madrid",meetingPoint:"the park"};
describe("share copy",()=>{
 it("uses the walk timezone and agreed title",()=>{const result=walkPreview(input,0);expect(result.title).toBe("BitcoinWalk Barcelona | Saturday, 10 October 2026");expect(result.description).toContain("at 10:00 AM. Meet at the park");});
 it("does not invite users to past walks",()=>{const result=walkPreview(input,Date.parse("2027-01-01"));expect(result.title).toContain("Past walk");expect(result.description).toContain("took place");expect(result.description).not.toContain("Join");});
 it("labels UTC when the source has no timezone",()=>expect(walkPreview({...input,timeZone:null},0).description).toContain("8:00 AM UTC"));
 it("bounds long Unicode names and descriptions",()=>{const result=walkPreview({...input,city:"Warszawa Łódź ".repeat(20)},0);expect([...result.title].length).toBeLessThanOrEqual(80);expect([...result.description].length).toBeLessThanOrEqual(160);expect(cityPreview("a".repeat(100)).title.length).toBeLessThanOrEqual(65);});
 it("removes markup, controls and extra whitespace",()=>expect(previewText("<b>Hello</b>\n  world",100)).toBe("Hello world"));
});
