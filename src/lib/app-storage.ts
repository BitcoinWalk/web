const paymentDatabaseRoots=[
  "/var/lib/bitcoinwalk-app-staging/",
  "/var/lib/bitcoinwalk-app-production/",
  "/home/bitcoinwalk/.local/state/bitcoinwalk-production/",
] as const;

const logoRoots=[
  "/home/bitcoinwalk/.local/share/bitcoinwalk/city-logos",
  "/home/bitcoinwalk/.local/share/bitcoinwalk-production/city-logos",
] as const;

export function isApprovedPaymentDatabase(path:string):boolean{
  return paymentDatabaseRoots.some(root=>path.startsWith(root)&&path.length>root.length);
}

export function isApprovedLogoRoot(path:string):boolean{
  return logoRoots.some(root=>path===root||path.startsWith(`${root}/`));
}
