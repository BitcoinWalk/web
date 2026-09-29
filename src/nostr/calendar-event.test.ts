import { describe, expect, it } from "vitest";
import { createCalendarEvent,createOrganizerCalendarEvent } from "./calendar-event";

const city = {
  cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f",
  slug: "austin",
  cityName: "Austin",
  startAt: "2026-09-19T15:00:00.000Z",
  description: "A weekly walk.",
  meetingPoint: { description: "City Hall", latitude: 30.2672, longitude: -97.7431 },
  chatUrl: "https://example.com/chat",
  heroImageUrl: "https://example.com/hero.jpg",
};

describe("NIP-52 calendar event", () => {
  it("includes schedule, location, image, and chat fields", () => {
    const event = createCalendarEvent(city, { id: "austin-20260919", startUnixSeconds: 1_789_715_200 });
    expect(event.kind).toBe(31923);
    expect(event.tags).toContainEqual(["image", "https://example.com/hero.jpg"]);
    expect(event.tags).toContainEqual(["r", "https://example.com/chat"]);
    expect(event.tags).toContainEqual(["g", "9v6kpvcxh"]);
  });
  it("marks a managed per-walk image override without changing the city template",()=>{
    const override="https://app-staging.bitcoinwalk.org/api/media/files/"+"a".repeat(64)+".webp";
    const event=createOrganizerCalendarEvent({revision:{event:{id:"1".repeat(64)} as never,city},approval:{event:{id:"2".repeat(64)} as never,approval:{}} as never},{id:`${crypto.randomUUID()}:2026-09-19`,seriesId:crypto.randomUUID(),localDate:"2026-09-19",localTime:"10:00",timeZone:"America/Chicago",start:1789715200,end:1789718800,meetingPoint:city.meetingPoint,heroImageUrl:override});
    expect(event.tags).toContainEqual(["image",override]);expect(event.tags).toContainEqual(["bitcoinwalk-image","override-v1"]);expect(city.heroImageUrl).toBe("https://example.com/hero.jpg");
  });
  it("emits every required day tag when an occurrence crosses UTC midnight",()=>{
    const event=createCalendarEvent(city,{id:"midnight",startUnixSeconds:86_300,endUnixSeconds:86_500});
    expect(event.tags.filter(tag=>tag[0]==="D")).toEqual([["D","0"],["D","1"]]);
  });
});
