import type {ReactNode} from "react";
import DashboardShell from "../../components/dashboard-shell";
export default function AdminLayout({children}:{children:ReactNode}){return <DashboardShell>{children}</DashboardShell>;}
