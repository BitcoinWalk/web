import {beforeEach,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({queryPublishedCity:vi.fn(),readyForCity:vi.fn()}));
vi.mock("../nostr/city-records",()=>({queryPublishedCity:mocks.queryPublishedCity}));
vi.mock("../lib/server-relay-config",()=>({serverReadRelays:()=>["ws://127.0.0.1:3340/"]}));
vi.mock("./runtime",()=>({getLogoCatalog:()=>({readyForCity:mocks.readyForCity})}));

import {loadPublishedLogoPack} from "./serving";

beforeEach(()=>{vi.clearAllMocks();});

it("uses the approved route slug when a legacy revision has a different spelling",async()=>{
  mocks.queryPublishedCity.mockResolvedValue({event:{id:"a".repeat(64)},city:{cityId:"8e136ccb-923b-41aa-a6d1-1290b0b3a014",slug:"wurzburg"}});
  mocks.readyForCity.mockResolvedValue({slug:"wuerzburg"});
  await expect(loadPublishedLogoPack("wuerzburg")).resolves.toEqual({slug:"wuerzburg"});
  expect(mocks.readyForCity).toHaveBeenCalledWith({cityId:"8e136ccb-923b-41aa-a6d1-1290b0b3a014",slug:"wuerzburg"});
});
