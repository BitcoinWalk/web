import type { CityDocument } from "../domain/city";
import { directoryConfig } from "../lib/directory-config";

export default function AdminCityLink({ city, approved }: { city: CityDocument; approved: boolean }) {
  if (!approved) return <p>City walk is not public. Approve or restore this city to open its walk page.</p>;
  const paid = Object.hasOwn(directoryConfig.paidCities, city.cityId) ? directoryConfig.paidCities[city.cityId] : undefined;
  const href = paid?.slug === city.slug && paid.subdomainReady
    ? `https://${city.slug}.bitcoinwalk.org`
    : `/${encodeURIComponent(city.slug)}`;
  return <p><a href={href} target="_blank" rel="noopener noreferrer">Open BitcoinWalk {city.cityName} ↗</a></p>;
}
