import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import GuidePage from "./page";

describe("Guide dashboard entry",()=>{it("reserves a separate private conversation surface",()=>{const html=renderToStaticMarkup(createElement(GuidePage));expect(html).toContain("BitcoinWalk Guide");expect(html).toContain("private conversation");});});
