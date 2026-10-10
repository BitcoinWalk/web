import type {Metadata} from "next";
import type {ReactNode} from "react";
import DashboardShell from "../../components/dashboard-shell";
export const metadata:Metadata={icons:{
  icon:[{url:"/brand/bitcoinwalk-admin-favicon.png",type:"image/png",sizes:"192x192"}],
  shortcut:"/brand/bitcoinwalk-admin-favicon.png",
  apple:[{url:"/brand/bitcoinwalk-admin-favicon.png",type:"image/png",sizes:"192x192"}],
}};
export default function AdminLayout({children}:{children:ReactNode}){return <DashboardShell>{children}</DashboardShell>;}
