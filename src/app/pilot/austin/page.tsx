import CityChat from "../../../components/city-chat";
import Link from "next/link";
import { austinPilot, austinPilotChat } from "../../../lib/austin-pilot";

export const metadata = {
  title: "Austin paid-city pilot | BitcoinWalk",
  robots: { index: false, follow: false },
};

export default function AustinPilotPage() {
  return (
    <main>
      <p>BitcoinWalk / isolated paid-city pilot</p>
      <h1>BitcoinWalk Austin</h1>
      <p>Test fixture — not a live walk or a paid purchase. No payment has been taken.</p>
      <p>This page tests a dedicated city relay, separate from the global BitcoinWalk chat. Event details will come from an approved city record in the full app.</p>
      <CityChat cityId={austinPilot.cityId} slug={austinPilot.slug} config={austinPilotChat} paid />
      <hr />
      <h2>Test this journey</h2>
      <ol>
        <li>On desktop, open the chat as BitcoinWalk admin.</li>
        <li>On mobile, open the same chat link using a separate regular Nostr identity. Join without an invite code.</li>
        <li>Send a different test message from each device. Check both appear on both devices, including after reopening the channel.</li>
        <li>With a separate non-member account, check that messages stay hidden before joining.</li>
        <li>Using a disposable test member, test removal and banning. Removal alone is not a ban: open joining should allow a removed, unbanned member to rejoin.</li>
      </ol>
      <p>Mobile: localhost is this computer only. Share the Armada destination from the button to test on your phone.</p>
      <p><Link href="/austin">Compare the free-city preview (global chat)</Link></p>
      <p>Invite-code creation is not supported by this pilot. It is not required for open joining.</p>
    </main>
  );
}
