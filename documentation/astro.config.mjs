import {defineConfig} from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://docs.bitcoinwalk.org",
  integrations: [
    starlight({
      title: "BitcoinWalk Documentation",
      description: "Plain-language guides for joining, hosting and operating a BitcoinWalk.",
      favicon: "/bitcoinwalk-favicon.png",
      logo: {src: "./src/assets/bitcoinwalk-horizontal.png", alt: "BitcoinWalk"},
      social: [
        {icon: "github", label: "BitcoinWalk on GitHub", href: "https://github.com/BitcoinWalk"}
      ],
      sidebar: [
        {label: "Start here", items: [
          {label: "BitcoinWalk documentation", slug: "index"},
          {label: "Find or start a walk", slug: "start/find-or-start"}
        ]},
        {label: "Hosts", items: [
          {label: "Manage your city and walks", slug: "organizers/manage-city-and-walks"},
          {label: "Complete city setup", slug: "hosts/complete-city-setup"},
          {label: "City Transfer", slug: "organizers/transfer-city-ownership"}
        ]},
        {label: "Sponsors", items: [
          {label: "Sponsor a BitcoinWalk", slug: "sponsors/how-sponsorship-works"}
        ]},
        {label: "Chat", items: [
          {label: "Walkie Talkie and Guide", slug: "chat/walkie-talkie-and-guide"},
          {label: "Configure Armada", slug: "chat/configure-armada"}
        ]},
        {label: "Relay operators", items: [
          {label: "Relay compatibility", slug: "relays/compatibility"},
          {label: "Run on your own relay", slug: "relays/run-on-your-own-relay"}
        ]},
        {label: "Resources", items: [
          {label: "Repositories, APIs, brand and roadmap", slug: "resources"}
        ]}
      ],
      customCss: ["./src/styles/custom.css"]
    })
  ]
});
