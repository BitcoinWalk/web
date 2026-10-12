"use client";
import Link from "next/link";
import type {ReactNode} from "react";
import {useDashboard} from "../../../components/dashboard-context";
export default function SponsorAdminLayout({children}:{children:ReactNode}){const {role}=useDashboard();return <>{role==="super-admin"&&<nav aria-label="Sponsor administration"><Link href="/admin/sponsors">Sponsorships</Link>{" · "}<Link href="/admin/sponsors/payments">Payments</Link></nav>}{children}</>;}
