#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const primaryColor = '#92288E';
const svgPath = path.join(__dirname, 'assets', 'appointy.svg');
const assetsDir = path.join(__dirname, 'assets');

async function generateAssets() {
  // Icon sizes for Android and iOS
  const iconSizes = [
    { size: 192, name: 'icon-192x192.png' },      // Android xxxhdpi
    { size: 144, name: 'icon-144x144.png' },      // Android xxhdpi
    { size: 120, name: 'icon-120x120.png' },      // iOS
    { size: 152, name: 'icon-152x152.png' },      // iOS iPad
    { size: 167, name: 'icon-167x167.png' },      // iOS iPad Pro
    { size: 180, name: 'icon-180x180.png' },      // iOS
    { size: 96, name: 'icon-96x96.png' },         // Android xhdpi
    { size: 72, name: 'icon-72x72.png' },         // Android hdpi
  ];

  console.log('Generating app icons...');
  for (const { size, name } of iconSizes) {
    try {
      await sharp(svgPath)
        .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toFile(path.join(assetsDir, name));
      console.log(`✓ ${name} (${size}x${size})`);
    } catch (error) {
      console.error(`✗ Failed to generate ${name}:`, error.message);
    }
  }

  // Generate splash screen (1080x2340 - common Android size)
  console.log('\nGenerating splash screen...');
  try {
    const splashWidth = 1080;
    const splashHeight = 2340;
    const logoSize = 200;

    // Create a gradient background using sharp
    const svg = `
      <svg width="${splashWidth}" height="${splashHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#92288E;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#66248F;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="${splashWidth}" height="${splashHeight}" fill="url(#grad)"/>
        <image href="data:image/svg+xml;base64,${Buffer.from(fs.readFileSync(svgPath, 'utf-8')).toString('base64')}"
          width="${logoSize}" height="${logoSize}"
          x="${(splashWidth - logoSize) / 2}" y="${(splashHeight - logoSize) / 2 - 300}"/>
        <text x="${splashWidth / 2}" y="${splashHeight / 2 + 200}"
          font-size="72" font-weight="bold" fill="white" text-anchor="middle" font-family="system-ui">
          Auxilio
        </text>
      </svg>
    `;

    await sharp(Buffer.from(svg))
      .png()
      .toFile(path.join(assetsDir, 'splash.png'));
    console.log('✓ splash.png (1080x2340)');
  } catch (error) {
    console.error('✗ Failed to generate splash screen:', error.message);
  }

  console.log('\nAsset generation complete!');
}

generateAssets().catch(error => {
  console.error('Error generating assets:', error);
  process.exit(1);
});
