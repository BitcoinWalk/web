import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import AdminTabs,{AdminTabPanel,nextTabIndex} from "./admin-tabs";

describe("admin tabs",()=>{
 it("wraps arrow navigation and supports Home and End",()=>{expect(nextTabIndex(0,"ArrowLeft",3)).toBe(2);expect(nextTabIndex(2,"ArrowRight",3)).toBe(0);expect(nextTabIndex(1,"Home",3)).toBe(0);expect(nextTabIndex(1,"End",3)).toBe(2);});
 it("connects the active tab to its panel",()=>{const tabs=[{id:"cities" as const,label:"Cities",count:2},{id:"sponsors" as const,label:"Sponsors",count:1}],html=renderToStaticMarkup(createElement("main",null,createElement(AdminTabs,{tabs,value:"cities",label:"Sponsorship views",idPrefix:"sponsorships",onChange:()=>{}}),createElement(AdminTabPanel,{idPrefix:"sponsorships",value:"cities"},"City list")));expect(html).toContain('role="tablist"');expect(html).toContain('aria-selected="true"');expect(html).toContain('aria-controls="admin-panel-sponsorships-cities"');expect(html).toContain('aria-labelledby="admin-tab-sponsorships-cities"');expect(html).toContain('tabindex="-1"');});
 it("keeps long labels usable at narrow widths and zoom",()=>{const css=readFileSync("src/components/admin-tabs.module.css","utf8");expect(css).toContain("overflow-x:auto");expect(css).toContain("white-space:nowrap");expect(css).toContain("min-height:44px");expect(css).toContain(":focus-visible");});
});
