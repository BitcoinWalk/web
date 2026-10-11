import {describe,expect,it} from "vitest";
import {prefersLightningWalletLaunch} from "./lightning-device";

describe("adaptive Lightning presentation",()=>{
 it("opens installed wallets on phones and Android devices",()=>{
  expect(prefersLightningWalletLaunch({userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"})).toBe(true);
  expect(prefersLightningWalletLaunch({userAgent:"Mozilla/5.0 (Linux; Android 15; Pixel 9)"})).toBe(true);
 });
 it("shows a QR instead of launching a wallet on desktop",()=>{
  expect(prefersLightningWalletLaunch({userAgent:"Mozilla/5.0 (X11; Linux x86_64) Chrome/140"})).toBe(false);
  expect(prefersLightningWalletLaunch({userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64)",maxTouchPoints:10})).toBe(false);
 });
 it("recognizes iPad desktop mode and honors client hints",()=>{
  expect(prefersLightningWalletLaunch({userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X)",maxTouchPoints:5})).toBe(true);
  expect(prefersLightningWalletLaunch({userAgent:"Mozilla/5.0 (Linux; Android 15)",userAgentDataMobile:false})).toBe(false);
 });
});
