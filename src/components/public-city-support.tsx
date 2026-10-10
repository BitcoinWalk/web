import {getPaymentRuntime} from "../payments/runtime";
import CitySupportActions from "./city-support-actions";

export default function PublicCitySupport({cityId,revisionId,cityName,requestedTier}:{cityId:string;revisionId:string;cityName:string;requestedTier?:"free"|"paid"}){
 let upgradeAvailable=false;
 try{upgradeAvailable=requestedTier==="free"&&!getPaymentRuntime().store.entitled(cityId);}catch{/* Donation remains available if checkout status is unavailable. */}
 return <CitySupportActions cityId={cityId} revisionId={revisionId} cityName={cityName} upgradeAvailable={upgradeAvailable}/>;
}
