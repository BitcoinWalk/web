import type { CityDocument } from "../domain/city";

export default function AdminCityLink({ city, approved }: { city: CityDocument; approved: boolean }) {
  if (!approved) return <p>City walk is not public. Approve or restore this city to open its walk page.</p>;
  const href = `/${encodeURIComponent(city.slug)}`;
  return <p><a href={href} target="_blank" rel="noopener noreferrer">Open BitcoinWalk {city.cityName} ↗</a></p>;
}
