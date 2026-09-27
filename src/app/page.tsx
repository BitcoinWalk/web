import {headers} from "next/headers";
import {redirect} from "next/navigation";
import CityDirectory from "../components/city-directory";
import {paidCityForHost} from "../domain/event-routing";
import {directoryConfig} from "../lib/directory-config";

export const dynamic="force-dynamic";

export default async function HomePage(){
  const paid=paidCityForHost((await headers()).get("host"),directoryConfig.paidCities);
  if(!paid)return <CityDirectory/>;
  redirect(`https://bitcoinwalk.org/${encodeURIComponent(paid.slug)}`);
}
