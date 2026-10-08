import {resolvePublicCityHost, type PublicCityHost as HostPresentation} from "../server/public-city-host";
import WalkHost from "./walk-host";

export default async function PublicCityHost({cityId, cityName, personalPubkey}: {
  cityId: string; cityName: string; personalPubkey?: string;
}) {
  const host = await resolvePublicCityHost(cityId, cityName, personalPubkey);
  return <CityHostPanel host={host}/>;
}

export function CityHostPanel({host}: {host: HostPresentation}) {
  if (host.state === "unavailable") return <section aria-label="Hosted by"><h2>Hosted by</h2><p>City host identity is temporarily unavailable.</p></section>;
  return <WalkHost key={host.pubkey} pubkey={host.pubkey} branded={host.state === "brand"}
    profile={host.state === "brand" ? {name: host.name} : undefined}/>;
}
