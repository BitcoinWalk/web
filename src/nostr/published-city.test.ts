import { describe, expect, it, vi } from "vitest";
import { finalizeEvent, type Event, type Filter } from "nostr-tools";
import { createApprovalEvent, createCityUpdateEvent } from "./city-event";
import { queryPublishedCity } from "./city-records";

const state = vi.hoisted(() => ({ events: [] as Event[], filters: [] as Filter[] }));
vi.mock("./authority", () => ({
  SUPER_ADMIN_PUBKEY: "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  isSuperAdmin: (key: string) => key === "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
}));
vi.mock("nostr-tools", async importOriginal => {
  const actual = await importOriginal<typeof import("nostr-tools")>();
  return { ...actual, SimplePool: class {
    subscribeEose(_relays: string[], filter: Filter, callbacks: {onevent: (event: Event) => void; onclose: (reasons: {url:string;reason:string}[]) => void}) {
      state.filters.push(filter);
      queueMicrotask(() => {
        state.events.filter(event => actual.matchFilter(filter,event)).sort(actual.compareEvents).slice(0,filter.limit).forEach(callbacks.onevent);
        callbacks.onclose([{url:"wss://test.invalid",reason:"closed automatically on eose"}]);
      });
    }
    close() {}
    destroy() {}
  }};
});

describe("public history reads", () => {
  it("loads an old approved snapshot by ID despite more than 200 newer edits and decisions", async () => {
    const key = new Uint8Array(32); key[31] = 1;
    const city = {cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",slug:"radom",cityName:"Radom",startAt:"2026-10-03T10:00:00Z",description:"Original",meetingPoint:{description:"Square",latitude:1,longitude:2},heroImageUrl:"https://example.com/hero.jpg"};
    const original=finalizeEvent({...createCityUpdateEvent(city),created_at:1},key);
    state.events=[original,finalizeEvent({...createApprovalEvent({cityId:city.cityId,cityRevisionId:original.id,status:"approved"}),created_at:2},key)];
    state.filters=[];
    for(let i=0;i<205;i++) {
      const edit=finalizeEvent({...createCityUpdateEvent({...city,description:`Edit ${i}`}),created_at:i+3},key);
      state.events.push(edit,finalizeEvent({...createApprovalEvent({cityId:city.cityId,cityRevisionId:edit.id,status:"rejected"}),created_at:i+3},key));
    }
    expect((await queryPublishedCity(["wss://test.invalid"],"radom"))?.event.id).toBe(original.id);
    expect(state.filters.some(filter=>filter.until !== undefined)).toBe(true);
    expect(state.filters.some(filter=>filter.ids?.includes(original.id))).toBe(true);
  });
});
