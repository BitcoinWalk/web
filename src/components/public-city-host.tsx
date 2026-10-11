import {resolvePublicCityHost, type PublicCityHost as HostPresentation} from "../server/public-city-host";
import {resolvePublicCityPayment} from "../server/public-city-payment";
import type {PublicCityPaymentAction} from "../domain/public-city-payment";
import AdaptiveLightningAction from "./adaptive-lightning-action";
import WalkHost from "./walk-host";
import styles from "./walk-host.module.css";
import type {Event} from "nostr-tools";

export default async function PublicCityHost({cityId, cityName, citySlug, personalPubkey}: {
  cityId: string; cityName: string; citySlug: string; personalPubkey?: string;
}) {
  const host = await resolvePublicCityHost(cityId, cityName, personalPubkey);
  return <CityHostPanel host={host} payment={await resolvePublicCityPayment(cityId,citySlug,host)}/>;
}

export function CityHostPanel({host,payment,event}: {host: HostPresentation;payment:PublicCityPaymentAction;event?:Event}) {
  if (host.state === "unavailable") return <section className={styles.host} aria-label="Hosted by"><h2>Hosted by</h2><p>City host identity is temporarily unavailable.</p>
    {payment.kind === "donate" && <AdaptiveLightningAction className={styles.zap} href={payment.href} title="Donate to BitcoinWalk HQ">Donate to BitcoinWalk HQ ⚡</AdaptiveLightningAction>}
  </section>;
  return <WalkHost key={host.pubkey} pubkey={host.pubkey} payment={payment}
    profile={host.state === "brand" ? {name: host.name} : undefined} event={event}/>;
}
