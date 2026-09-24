import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CityChat from "./city-chat";
import type {ChatConfig} from "../domain/chat";

const config:ChatConfig={environment:"production",global:{relay:"wss://chat.bitcoinwalk.org",groupId:"global"},paidCities:{paid:{slug:"warsaw",destination:{relay:"wss://warsaw.bitcoinwalk.org",groupId:"city"}}}};

describe("event community action",()=>{
  it("links a free walk to the global Armada community",()=>{
    const html=renderToStaticMarkup(createElement(CityChat,{cityId:"free",slug:"memphis",config,paid:false}));
    expect(html).toContain("Join the community on Armada");
    expect(html).toContain("https://armada.buzz/s/chat.bitcoinwalk.org/global");
  });
  it("links an entitled paid walk to its city relay",()=>{
    const html=renderToStaticMarkup(createElement(CityChat,{cityId:"paid",slug:"warsaw",config,paid:true}));
    expect(html).toContain("https://armada.buzz/s/warsaw.bitcoinwalk.org/city");
  });
  it("never falls back to global chat for a paid city awaiting provisioning",()=>{
    const html=renderToStaticMarkup(createElement(CityChat,{cityId:"missing",slug:"madeira",config,paid:true}));
    expect(html).toContain("Chat is being set up");
    expect(html).not.toContain("chat.bitcoinwalk.org/global");
  });
});
