import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CityPayment from "./city-payment";

describe("CityPayment",()=>{
  it("renders the automatic Pro payment screen without action buttons",()=>{
    const html=renderToStaticMarkup(createElement(CityPayment,{cityId:"city",revisionId:"a".repeat(64),owner:"b".repeat(64),payoutDestination:"alice@wallet.example",autoCreate:true,passive:true}));
    expect(html).toContain("Pro plan — 21,000 sats");
    expect(html).not.toContain("<button");
  });
});
