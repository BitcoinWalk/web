"use client";

import SubmissionApprovals from "../app/admin/_approvals-screen";
import CityBrandReview from "./city-brand-review";
import SuperAdminActionQueue from "./super-admin-action-queue";
import {useDashboard} from "./dashboard-context";
import styles from "./requests-screen.module.css";
import CityAnnouncementReview from "./city-announcement-review";

export default function RequestsScreen(){
 const {pubkey,role}=useDashboard();
 return <main className={styles.page}><h1>Requests</h1><p className={styles.intro}>Review city applications, activate official Pro identities and resolve post-approval setup checks from one place.</p>{role==="super-admin"&&<SuperAdminActionQueue actor={pubkey}/>}<div className={styles.queueGrid}>{role==="super-admin"&&<CityBrandReview actor={pubkey}/>}<SubmissionApprovals/></div>{role==="super-admin"&&<CityAnnouncementReview/>}</main>;
}
