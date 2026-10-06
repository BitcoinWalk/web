import type {Metadata} from "next";
import SponsorCheckout from "./checkout";

export const metadata:Metadata={
  title:"Sponsor a BitcoinWalk | BitcoinWalk",
  description:"Support a local BitcoinWalk with a Lightning-funded one, two or five-walk sponsorship package.",
};

export default async function SponsorPage({searchParams}:{searchParams:Promise<{city?:string|string[]}>}){const value=(await searchParams).city;return <main><h1>Choose the city and the walk you’d like to sponsor.</h1><SponsorCheckout initialCity={typeof value==="string"&&value.length<=100?value:""}/></main>;}
