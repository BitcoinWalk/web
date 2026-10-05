import sharp from "sharp";
// Rasterize once with the pinned brand font; deployed hosts need no font stack.
await sharp({text:{text:'<span foreground="white">Powered by</span>',font:"Ubuntu Bold Italic 24",fontfile:"design/city-logo-templates/v1/fonts/Ubuntu-BoldItalic.ttf",rgba:true,dpi:72}}).png().toFile("public/brand/bitcoinwalk-powered-by.png");
// Preserve the approved on-black white symbol, without its city wordmark.
// This crop also excludes the historical stray stripe at y=0.
const crop=await sharp("design/city-logo-templates/v1/examples/prototype-packs/warszawa/warszawa-bitcoinwalk-on-black.png")
  .extract({left:180,top:100,width:420,height:320}).png().toBuffer();
const icon=await sharp(crop).trim().png().toBuffer();
await sharp(icon).toFile("public/brand/bitcoinwalk-share-icon.png");
const mark=await sharp(icon).resize(280,280,{fit:"contain",background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
await sharp({create:{width:1200,height:630,channels:3,background:"#25333a"}}).composite([{input:mark,left:460,top:175}]).jpeg({quality:82,mozjpeg:true}).toFile("public/brand/bitcoinwalk-share-fallback.jpg");
