import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {RelayCards} from "./page";

describe("relay monitoring cards",()=>{
 it("renders accessible RAG labels and colour hooks while retaining every mixed result",()=>{const base={purpose:"Application relay",environment:"staging" as const,checkedAt:"2026-10-04T12:00:00.000Z",dns:"ok" as const,tls:"ok" as const,https:"ok" as const,wss:"ok" as const,nip11:"ok" as const};const html=renderToStaticMarkup(createElement(RelayCards,{relays:[{...base,url:"wss://healthy.example/",status:"green"},{...base,url:"wss://partial.example/",nip11:"malformed",status:"amber"},{...base,url:"wss://offline.example/",dns:"failed",tls:"failed",https:"failed",wss:"failed",nip11:"failed",status:"red"},{...base,url:"wss://unknown.example/",dns:"unknown",tls:"unknown",https:"unknown",wss:"unknown",nip11:"unknown",status:"unknown"}]}));expect(html).toContain("Healthy");expect(html).toContain("Partially healthy");expect(html).toContain("Failing / offline");expect(html).toContain("Unknown");for(const status of ["green","amber","red","unknown"])expect(html).toContain(`data-rag="${status}"`);for(const host of ["healthy","partial","offline","unknown"])expect(html).toContain(`wss://${host}.example/`);});
});
