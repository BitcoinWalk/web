import ProSetupScreen from "../pro-setup/screen";

export const dynamic = "force-dynamic";

export default function UpgradePage() {
  return <ProSetupScreen enabled={process.env.BITCOINWALK_PRO_SETUP_PREVIEW === "true"}/>;
}
