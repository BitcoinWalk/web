import {describe,it,expect} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import MessageHistory from "./message-history";

describe("chat history window",()=>{
 it("initially renders only the latest three in chronological order",()=>{
  const messages=Array.from({length:25},(_,index)=>({id:String(index),createdAt:index}));
  const html=renderToStaticMarkup(<MessageHistory messages={messages} label="Guide messages" render={message=><span>message-{message.id}</span>}/>);
  expect(html.match(/data-message-id=/g)).toHaveLength(3);
  expect(html).toContain("Load older messages");expect(html).not.toContain("message-21<");
  expect(html.indexOf("message-22<")).toBeLessThan(html.indexOf("message-24<"));
 });
 it("does not offer older history for short conversations",()=>{
  const html=renderToStaticMarkup(<MessageHistory messages={[{id:"one",createdAt:1}]} label="City messages" loading render={()=><span>Hello</span>}/>);
  expect(html).not.toContain("Load older messages");expect(html).toContain('aria-busy="true"');expect(html).toContain("Hello");
 });
});
