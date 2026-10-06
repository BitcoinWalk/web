"use client";
import OrganizerEvents from "../../organizer/events/_screen";
import {useDashboard} from "../../../components/dashboard-context";

export default function WalksPage(){
 const dashboard=useDashboard(),canModerate=dashboard.role==="super-admin";
 return <main><h1>Walks</h1><OrganizerEvents canModerate={canModerate}/></main>;
}
