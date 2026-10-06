import Link from "next/link";
import type {ReactNode} from "react";
export default function SponsorAdminLayout({children}:{children:ReactNode}){return <><nav aria-label="Sponsor administration"><Link href="/admin/sponsors/payments">All sponsors and payments</Link>{" · "}<Link href="/admin/sponsors">Assignments and artwork</Link></nav>{children}</>;}
