import {describe,expect,it} from "vitest";
import {ACCEPTED_IMAGE_TYPES,MAX_IMAGE_UPLOAD_BYTES,assertAcceptedImageFile,isManagedImageURL} from "./media-client";

describe("managed image upload validation",()=>{
 it.each(ACCEPTED_IMAGE_TYPES)("accepts non-empty %s files up to 5 MB",type=>{
  expect(()=>assertAcceptedImageFile({type,size:1})).not.toThrow();
  expect(()=>assertAcceptedImageFile({type,size:MAX_IMAGE_UPLOAD_BYTES})).not.toThrow();
 });
 it.each(["image/gif","image/svg+xml","image/heic","application/octet-stream",""])("rejects unsupported %s files",type=>{
  expect(()=>assertAcceptedImageFile({type,size:1024})).toThrow("JPEG, PNG or WebP");
 });
 it("rejects empty and oversized files before requesting a signature",()=>{
  expect(()=>assertAcceptedImageFile({type:"image/jpeg",size:0})).toThrow("non-empty");
  expect(()=>assertAcceptedImageFile({type:"image/png",size:MAX_IMAGE_UPLOAD_BYTES+1})).toThrow("up to 5 MB");
 });
 it("recognizes only protected BitcoinWalk media URLs as already uploaded",()=>{expect(isManagedImageURL(`https://bitcoinwalk.org/api/media/files/${"a".repeat(64)}.webp`)).toBe(true);expect(isManagedImageURL(`https://app-staging.bitcoinwalk.org/api/media/files/${"b".repeat(64)}.webp`)).toBe(true);expect(isManagedImageURL(`https://example.com/api/media/files/${"a".repeat(64)}.webp`)).toBe(false);expect(isManagedImageURL("https://bitcoinwalk.org/photo.jpg")).toBe(false);});
});
