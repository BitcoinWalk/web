"use client";

import SubmissionApprovals from "../app/admin/_approvals-screen";
import CityBrandReview from "./city-brand-review";
import {useDashboard} from "./dashboard-context";

export default function RequestsScreen(){
 const {pubkey,role}=useDashboard();
 return <main><h1>Requests</h1>{role==="super-admin"&&<CityBrandReview actor={pubkey}/>}<SubmissionApprovals/></main>;
}
