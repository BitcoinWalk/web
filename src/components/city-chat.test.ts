import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CityChat from "./city-chat";
import type {ChatConfig} from "../domain/chat";

const config:ChatConfig={environment:"production",global:{relay:"wss://chat.bitcoinwalk.org",groupId:"global"},paidCities:{paid:{slug:"warsaw",destination:{relay:"wss://warsaw.bitcoinwalk.org",groupId:"city"}}}};

describe("event community action",()=>{
  it("links a free walk to the global Armada community",()=>{
    const html=renderToStaticMarkup(createElement(CityChat,{cityId:"free",slug:"memphis",config,paid:false}));
    expect(html).toContain("Open Armada");
    expect(html).toContain("NIP-29, with NIP-17 support");
    expect(html).toContain("Armada Concord");
    expect(html).toContain("https://bitcoinwalk.org/join");
  });
  it("links an entitled paid walk to its city relay",()=>{
    const html=renderToStaticMarkup(createElement(CityChat,{cityId:"paid",slug:"warsaw",config,paid:true}));
    expect(html).toContain("https://armada.buzz/s/warsaw.bitcoinwalk.org/city");
  });
  it("hides both community surfaces for a paid city awaiting provisioning",()=>{
    const html=renderToStaticMarkup(createElement(CityChat,{cityId:"missing",slug:"madeira",config,paid:true}));
    expect(html).toBe("");
    expect(html).not.toContain("chat.bitcoinwalk.org/global");
  });
  it("renders Walkie Talkie and Armada independently",()=>{
    const walkieOnly={...config,paidCities:{paid:{...config.paidCities.paid,walkieTalkieEnabled:true,armadaEnabled:false}}};
    const walkieHtml=renderToStaticMarkup(createElement(CityChat,{cityId:"paid",slug:"warsaw",config:walkieOnly,paid:true}));
    expect(walkieHtml).toContain("Walkie Talkie");expect(walkieHtml).not.toContain("Open Armada");
    const armadaOnly={...config,paidCities:{paid:{...config.paidCities.paid,walkieTalkieEnabled:false,armadaEnabled:true}}};
    const armadaHtml=renderToStaticMarkup(createElement(CityChat,{cityId:"paid",slug:"warsaw",config:armadaOnly,paid:true}));
    expect(armadaHtml).not.toContain("Walkie Talkie");expect(armadaHtml).toContain("Open Armada");
  });
});
