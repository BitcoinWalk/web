import NostrUser from "../../../components/nostr-user";

// Public Satlantis identity supplied for this illustrative demo. No signing or publishing.
export const SATLANTIS_PUBKEY="a19aadee53bc71d25afef365067a3978ac30d5520d36ec8cc74d77a872af7359";

// Seed from signature-verified kind-0 event 11886789d665a88d49038767e6f60b0521b68dd0eafc7fa64521088f38a3996c.
// NostrUser refreshes from relays; the seed keeps the demo useful when relays are unavailable.
const profile={
 name:"Satlantis: Social Events",
 nip05:"satlantis@satlantis.io",
 picture:"https://cdn.satlantis.io/15xd2mmjnh3caykh77djsv73e0zkrp42jp5mwerx8f4m6su40wdvss7t3l3-1764605789321-56087efd-9ffc-4ade-bf71-1fca9e230071_15xd2mmjnh3caykh77djsv73e0zkrp42jp5mwerx8f4m6su40wdvss7t3l3-1760149389959-420e0862-6ba6-4377-a731-7e92d75df025_15xd2mmjnh3caykh77djsv73e0zkrp42jp5mwerx8f4m6su40wdvss7t3l3-1760051250178-12a292b2-aede-464c-898d-3ba561a9ae4a_IPLD.jpg",
};

export default function DemoSponsorProfile(){
 return <><NostrUser pubkey={SATLANTIS_PUBKEY} profile={profile} variant="compact" resolveProfile showLightning={false} copyValues={false} profileLink/><a href="https://satlantis.io" target="_blank" rel="noopener noreferrer">Visit Satlantis ↗</a></>;
}
