import type {Viewport} from "next";
import type {ReactNode} from "react";

// Let the mobile keyboard resize the layout rather than double-offsetting fixed UI.
export const viewport:Viewport={width:"device-width",initialScale:1,interactiveWidget:"resizes-content"};
export default function StartLayout({children}:{children:ReactNode}){return children;}
