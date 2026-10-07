import ProSetupScreen from "./screen";
export const dynamic = "force-dynamic";
export default function ProSetupPage() {
  return <ProSetupScreen enabled={process.env.BITCOINWALK_PRO_SETUP_PREVIEW === "true"}/>;
}
