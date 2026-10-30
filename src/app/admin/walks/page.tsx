"use client";
import OrganizerEvents from "../../organizer/events/_screen";
import {useDashboard,DashboardContext} from "../../../components/dashboard-context";
import {useDefaultCity} from "../../../components/use-default-city";

export default function WalksPage(){
 const dashboard=useDashboard(),canModerate=dashboard.role==="super-admin",preferred=useDefaultCity(dashboard.pubkey);
 const selectedCity=dashboard.selectedCity||(dashboard.cities.some(city=>city.id===preferred)?preferred:"");
 return <DashboardContext.Provider value={{...dashboard,selectedCity}}><main><h1>Walks</h1><OrganizerEvents key={selectedCity} canModerate={canModerate}/></main></DashboardContext.Provider>;
}
