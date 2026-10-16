import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {AdminButton,AdminFeedback,AdminPageHeader,AdminStatusBadge} from "./admin-ui";

describe("shared admin UI",()=>{
 it("provides consistent semantic primitives",()=>{
  const html=renderToStaticMarkup(createElement("main",null,
   createElement(AdminPageHeader,{title:"Cities",description:"Manage every city.",actions:createElement(AdminButton,{variant:"primary"},"Refresh")}),
   createElement(AdminFeedback,{tone:"error"},"Could not refresh."),
   createElement(AdminStatusBadge,{tone:"success"},"Online"),
  ));
  expect(html).toContain("<h1>Cities</h1>");expect(html).toContain('role="alert"');expect(html).toContain("Online");expect(html).toContain("Refresh");
 });
});
