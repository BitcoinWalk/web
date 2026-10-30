import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import EventModerationPanel from "./event-moderation";
import {queryEventModerations,requireEventModerationRelay} from "../nostr/event-moderation";
import {getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";

const hooks=vi.hoisted(()=>({load:undefined as undefined|(()=>Promise<void>),notify:vi.fn()}));
vi.mock("./dashboard-context",()=>({useDashboard:()=>({cities:[]}),useDashboardAutoLoad:(load:()=>Promise<void>)=>{hooks.load=load;}}));
vi.mock("./dashboard-notifications",()=>({useDashboardNotification:()=>hooks.notify}));
vi.mock("../nostr/signer",()=>({getBrowserExtensionPubkey:vi.fn(),signWithBrowserExtension:vi.fn(),authenticateWithBrowserExtension:vi.fn()}));
vi.mock("../nostr/event-moderation",async importOriginal=>({...await importOriginal<typeof import("../nostr/event-moderation")>(),queryEventModerations:vi.fn(),requireEventModerationRelay:vi.fn()}));
beforeEach(()=>{vi.resetAllMocks();vi.mocked(getBrowserExtensionPubkey).mockResolvedValue(SUPER_ADMIN_PUBKEY);vi.mocked(queryEventModerations).mockResolvedValue([]);vi.mocked(requireEventModerationRelay).mockRejectedValue(Error("Global organizer suspension requires relay 0.8.57 or newer. Nothing signed."));});
describe("opening city services is read-only",()=>{
 it("loads publishing history without running the write capability check or signing",async()=>{
  renderToStaticMarkup(createElement(EventModerationPanel,{scope:"city",fixedCityId:"city",cityName:"Test City"}));await hooks.load!();
  expect(queryEventModerations).toHaveBeenCalledWith(expect.any(Array),"city");expect(requireEventModerationRelay).not.toHaveBeenCalled();expect(signWithBrowserExtension).not.toHaveBeenCalled();expect(hooks.notify).not.toHaveBeenCalled();
 });
 it("labels a real read failure as loading, not a failed publishing decision",async()=>{
  vi.mocked(queryEventModerations).mockRejectedValue(Error("Relay unavailable"));renderToStaticMarkup(createElement(EventModerationPanel,{scope:"city",fixedCityId:"city"}));await hooks.load!();
  expect(hooks.notify).toHaveBeenCalledWith(expect.objectContaining({title:"Publishing access could not be loaded",message:"Relay unavailable"}));expect(signWithBrowserExtension).not.toHaveBeenCalled();
 });
 it("does not claim active publishing access or enable suspension before evidence loads",()=>{
  const html=renderToStaticMarkup(createElement(EventModerationPanel,{scope:"city",fixedCityId:"city",cityName:"Test City"}));expect(html).toContain("not checked");expect(html).toContain('<button disabled="">Suspend city</button>');expect(html).toContain("Refresh publishing access");
 });
 it("retains the relay capability guard before signing a real decision",()=>{
  const source=readFileSync(new URL("./event-moderation.tsx",import.meta.url),"utf8"),decide=source.slice(source.indexOf("async function decide"),source.indexOf("function begin"));
  expect(decide).toContain("if(!loaded)return");expect(decide.indexOf("await requireEventModerationRelay")).toBeGreaterThan(-1);expect(decide.indexOf("await requireEventModerationRelay")).toBeLessThan(decide.indexOf("await signWithBrowserExtension"));expect(decide).toContain('},"write")');
 });
});
