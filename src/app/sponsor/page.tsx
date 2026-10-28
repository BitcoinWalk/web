import type {Metadata} from "next";
import SponsorCheckout from "./checkout";

export const metadata:Metadata={
  title:"Sponsor a BitcoinWalk | BitcoinWalk",
  description:"Sponsor one BitcoinWalk, build a multi-city campaign, or support every available upcoming walk with a global campaign.",
};

export default async function SponsorPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const params=await searchParams,explicit=(Array.isArray(params.city)?params.city:[params.city]).filter((value):value is string=>typeof value==="string"&&value.length<=100),legacyBare=explicit.length===1?Object.entries(params).filter(([key,value])=>key!=="city"&&key!=="scope"&&value===""&&key.length<=100).map(([key])=>key):[],values=[...new Set([...explicit,...legacyBare])].slice(0,30),initialCity=values[0]??"",globalCampaign=params.scope==="global";return <main><h1>Sponsor the BitcoinWalk community.</h1><SponsorCheckout key={`${globalCampaign?"global":"custom"}:${values.join(":").toLocaleLowerCase()||"no-city"}`} initialCity={initialCity} initialCities={values} globalCampaign={globalCampaign}/></main>;}
