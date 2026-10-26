import type {LogoVariantAsset} from "../logos/catalog";
import type {CityLogoVariant} from "../logos/inkscape-source";

export const cityWalkTitleLogoVariant = "bitcoinwalk-horizontal-on-white" satisfies CityLogoVariant;

export default function CityWalkTitle({cityName}:{cityName:string;logo?:LogoVariantAsset}){
  return <h1 className="walk-city-title">BitcoinWalk {cityName}</h1>;
}
