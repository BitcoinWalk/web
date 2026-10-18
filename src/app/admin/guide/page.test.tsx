import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import GuidePage from "./page";

describe("Guide dashboard entry",()=>{it("sends old links to the Guide conversation inside Chat",()=>{const html=renderToStaticMarkup(createElement(GuidePage));expect(html).toContain("Dashboard moved");expect(html).toContain("/admin/chat?room=guide");expect(html).not.toContain("private conversation");});});
