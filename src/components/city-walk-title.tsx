import Image from "next/image";
import type {LogoVariantAsset} from "../logos/catalog";
import type {CityLogoVariant} from "../logos/inkscape-source";

export const cityWalkTitleLogoVariant = "bitcoinwalk-horizontal-on-white" satisfies CityLogoVariant;

export default function CityWalkTitle({cityName,logo}:{cityName:string;logo?:LogoVariantAsset}){
  return <h1 className="walk-city-title">
    {logo
      ? <Image className="walk-city-title__logo" src={logo.src} width={logo.width} height={logo.height} alt={`BitcoinWalk ${cityName}`} unoptimized priority/>
      : `BitcoinWalk ${cityName}`}
  </h1>;
}
