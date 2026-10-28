import sharp from "sharp";
for (const size of [192, 512, 180])
  await sharp("public/icon.svg")
    .resize(size, size)
    .png()
    .toFile(`public/${size === 180 ? "apple-touch-icon" : `icon-${size}`}.png`);
console.log("PWA icons generated.");
