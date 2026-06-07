#!/usr/bin/env node
/**
 * Generates app icons + splash from `assets/appointy.svg`.
 *
 * Outputs:
 *   - assets/icon.png            1024×1024, opaque white bg, logo centered
 *                                (used by iOS and as the Expo `icon` fallback)
 *   - assets/adaptive-icon.png   1024×1024, transparent bg, logo at ~60% of
 *                                canvas (Android adaptive foreground; the
 *                                center 66% safe zone keeps the logo
 *                                whole under any launcher mask, and the
 *                                transparency lets `adaptiveIcon.backgroundColor`
 *                                fill the remainder cleanly).
 *   - assets/icon-{72,96,120,144,152,167,180,192}x.png — back-compat sizes
 *     kept in case any older bundle path still references them.
 *   - assets/splash.png          1080×2340 brand splash.
 *
 * Run: `node generate-assets.js`. Requires `sharp` (already in devDeps).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const svgPath = path.join(__dirname, 'assets', 'appointy.svg');
const assetsDir = path.join(__dirname, 'assets');
const svgBuffer = fs.readFileSync(svgPath);

const PRIMARY = '#92288E';
const PRIMARY_LIGHT = '#66248F';

/** Render the source SVG into a centered PNG with padding and an
 *  optional background fill. `inset` is the proportion of the canvas
 *  that should be left blank around the logo (per side), so 0.2 means
 *  the logo lives in the central 60%. */
async function renderLogo({
  size,
  inset,
  background,
  outPath,
}) {
  const logoSize = Math.round(size * (1 - inset * 2));
  const offset = Math.round((size - logoSize) / 2);
  const logo = await sharp(svgBuffer, { density: 600 })
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: logo, top: offset, left: offset }])
    .png()
    .toFile(outPath);
}

async function generateAssets() {
  console.log('Generating app icons...');

  // Main square icon — used by iOS + Expo's fallback. Opaque white bg
  // so the logo (purple/pink gradient) reads clearly under iOS masking.
  await renderLogo({
    size: 1024,
    inset: 0.18,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
    outPath: path.join(assetsDir, 'icon.png'),
  });
  console.log('✓ icon.png (1024x1024, white bg, 64% logo)');

  // Adaptive foreground for Android. Transparent bg + tighter safe zone
  // so the launcher mask (circle/squircle) never crops the logo, and the
  // configured adaptiveIcon.backgroundColor fills the corners instead of
  // bleeding into the logo edges.
  await renderLogo({
    size: 1024,
    inset: 0.27,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    outPath: path.join(assetsDir, 'adaptive-icon.png'),
  });
  console.log('✓ adaptive-icon.png (1024x1024, transparent, 46% logo, safe-zone padded)');

  // Back-compat: keep the older sized variants so any stale reference
  // (older runtimes, prebuilt /android assets) still resolves.
  const iconSizes = [
    { size: 192, name: 'icon-192x192.png' },
    { size: 180, name: 'icon-180x180.png' },
    { size: 167, name: 'icon-167x167.png' },
    { size: 152, name: 'icon-152x152.png' },
    { size: 144, name: 'icon-144x144.png' },
    { size: 120, name: 'icon-120x120.png' },
    { size: 96, name: 'icon-96x96.png' },
    { size: 72, name: 'icon-72x72.png' },
  ];
  for (const { size, name } of iconSizes) {
    await renderLogo({
      size,
      inset: 0.18,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      outPath: path.join(assetsDir, name),
    });
    console.log(`✓ ${name} (${size}x${size})`);
  }

  console.log('\nGenerating splash screen...');
  const splashWidth = 1080;
  const splashHeight = 2340;
  const logoSize = 320;
  const splashSvg = `
    <svg width="${splashWidth}" height="${splashHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${PRIMARY};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${PRIMARY_LIGHT};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${splashWidth}" height="${splashHeight}" fill="url(#grad)"/>
      <image href="data:image/svg+xml;base64,${svgBuffer.toString('base64')}"
        width="${logoSize}" height="${logoSize}"
        x="${(splashWidth - logoSize) / 2}" y="${(splashHeight - logoSize) / 2 - 300}"/>
      <text x="${splashWidth / 2}" y="${splashHeight / 2 + 200}"
        font-size="72" font-weight="bold" fill="white" text-anchor="middle" font-family="system-ui">
        Auxilio
      </text>
    </svg>
  `;
  await sharp(Buffer.from(splashSvg)).png().toFile(path.join(assetsDir, 'splash.png'));
  console.log('✓ splash.png (1080x2340)');

  console.log('\nAsset generation complete!');
}

generateAssets().catch((error) => {
  console.error('Error generating assets:', error);
  process.exit(1);
});
