import {redirect} from "next/navigation";

export const dynamic = "force-dynamic";

export default async function UpgradePage({searchParams}:{searchParams:Promise<{city?:string|string[]}>}) {
  const cityValue=(await searchParams).city,city=Array.isArray(cityValue)?cityValue[0]:cityValue;
  redirect(city?`/admin/my-cities?city=${encodeURIComponent(city)}#pro-city-services`:"/admin/my-cities");
}
