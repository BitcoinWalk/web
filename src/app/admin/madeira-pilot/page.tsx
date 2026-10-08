import MadeiraPilotScreen from "./screen";
import {madeiraPilotEnabled} from "../../../server/madeira-pilot";
export const dynamic="force-dynamic";
export default function Page(){return <MadeiraPilotScreen enabled={madeiraPilotEnabled()}/>;}
