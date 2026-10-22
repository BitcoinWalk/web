import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CityChat, {WALKIE_TALKIE_ZAPSTORE_URL} from "./city-chat";
import type {ChatConfig} from "../domain/chat";

const config:ChatConfig={environment:"production",global:{relay:"wss://chat.bitcoinwalk.org",groupId:"global"},paidCities:{paid:{slug:"warsaw",destination:{relay:"wss://warsaw.bitcoinwalk.org",groupId:"city"}}}};

describe("event community action",()=>{
  it("links a free walk to the global Armada community",()=>{
    const html=renderToStaticMarkup(createElement(CityChat,{cityId:"free",slug:"memphis",config,paid:false}));
    expect(html).toContain("Open Armada");
    expect(html).toContain("Your BitcoinWalk companion app");
    expect(html).toContain("Get it on Zapstore");
    expect(html).toContain(WALKIE_TALKIE_ZAPSTORE_URL);
    expect(html).toContain("Armada Concord");
    expect(html).toContain("https://bitcoinwalk.org/join");
  });
  it("links an entitled paid walk to its city relay",()=>{
    const html=renderToStaticMarkup(createElement(CityChat,{cityId:"paid",slug:"warsaw",config,paid:true}));
    expect(html).toContain("https://armada.buzz/s/warsaw.bitcoinwalk.org/city");
  });
  it("still promotes the companion app when a paid city awaits community provisioning",()=>{
    const html=renderToStaticMarkup(createElement(CityChat,{cityId:"missing",slug:"madeira",config,paid:true}));
    expect(html).toContain("Walkie Talkie");
    expect(html).toContain(WALKIE_TALKIE_ZAPSTORE_URL);
    expect(html).not.toContain("Open Armada");
    expect(html).not.toContain("chat.bitcoinwalk.org/global");
  });
  it("promotes Walkie Talkie independently from the optional Armada community",()=>{
    const walkieOnly={...config,paidCities:{paid:{...config.paidCities.paid,walkieTalkieEnabled:true,armadaEnabled:false}}};
    const walkieHtml=renderToStaticMarkup(createElement(CityChat,{cityId:"paid",slug:"warsaw",config:walkieOnly,paid:true}));
    expect(walkieHtml).toContain("Walkie Talkie");expect(walkieHtml).toContain('target="_blank"');expect(walkieHtml).toContain('rel="noopener noreferrer"');expect(walkieHtml).not.toContain("Open Armada");
    const armadaOnly={...config,paidCities:{paid:{...config.paidCities.paid,walkieTalkieEnabled:false,armadaEnabled:true}}};
    const armadaHtml=renderToStaticMarkup(createElement(CityChat,{cityId:"paid",slug:"warsaw",config:armadaOnly,paid:true}));
    expect(armadaHtml).toContain("Walkie Talkie");expect(armadaHtml).toContain("Open Armada");
  });
});
