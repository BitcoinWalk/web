import {describe,expect,it,vi} from "vitest";
import {finalizeEvent} from "nostr-tools";
import {DEFAULT_HOME_PAGE,HOME_PAGE_ID,contentPageSchema,type ContentPage} from "../domain/content";
import {contentRoute,createContentRevision,latestContentPages,parseContentRevision} from "./content-records";
vi.mock("./authority",()=>({isSuperAdmin:()=>true,SUPER_ADMIN_PUBKEY:"test-admin"}));

const secret=new Uint8Array(32).fill(7);
function signed(page:ContentPage,time:number){const template=createContentRevision(page);return finalizeEvent({...template,created_at:time},secret);}
describe("signed static content",()=>{
 it("keeps the homepage at root and protects application URLs",()=>{expect(contentPageSchema.parse(DEFAULT_HOME_PAGE).slug).toBe("");expect(()=>contentPageSchema.parse({...DEFAULT_HOME_PAGE,slug:"home"})).toThrow();expect(()=>contentPageSchema.parse({...DEFAULT_HOME_PAGE,pageId:crypto.randomUUID(),slug:"admin"})).toThrow();});
 it("parses only exact super-admin records",()=>{const event=signed(DEFAULT_HOME_PAGE,1);expect(parseContentRevision(event)?.page.pageId).toBe(HOME_PAGE_ID);expect(parseContentRevision({...event,tags:[...event.tags,["extra","x"]]})).toBeNull();});
 it("selects the latest revision and redirects an old URL",()=>{const pageId=crypto.randomUUID(),first=signed({...DEFAULT_HOME_PAGE,pageId,slug:"about",title:"About"},10),second=signed({...DEFAULT_HOME_PAGE,pageId,slug:"about-us",title:"About us",previousRevisionId:first.id},20),rows=[first,second].map(parseContentRevision).filter(row=>row!==null);expect(latestContentPages(rows)[0].page.slug).toBe("about-us");expect(contentRoute(rows,"about")).toEqual({redirect:"/about-us"});expect(contentRoute(rows,"about-us")).toMatchObject({page:{page:{title:"About us"}}});});
});
