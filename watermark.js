const sharp = require('sharp');

// Add watermark to image buffer
async function addWatermark(imageBuffer) {
  const image = sharp(imageBuffer);
  const meta = await image.metadata();
  const width = meta.width || 1024;
  const height = meta.height || 1024;

  // Watermark SVG — bottom bar with logo + username
  const watermarkSvg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <!-- Bottom dark gradient bar -->
    <defs>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.85"/>
      </linearGradient>
    </defs>
    <rect x="0" y="${height - 120}" width="${width}" height="120" fill="url(#grad)"/>
    
    <!-- Robot emoji circle (logo) -->
    <circle cx="55" cy="${height - 52}" r="28" fill="#1a1a2e" opacity="0.9"/>
    <circle cx="55" cy="${height - 52}" r="28" fill="none" stroke="#00d4ff" stroke-width="2"/>
    <text x="55" y="${height - 44}" font-size="26" text-anchor="middle" fill="white">🤖</text>

    <!-- Channel name -->
    <text x="95" y="${height - 62}" 
      font-family="Arial, sans-serif" 
      font-size="22" 
      font-weight="bold" 
      fill="white" 
      opacity="0.95">Ai Daily By Jarvis</text>

    <!-- Username -->
    <text x="95" y="${height - 36}" 
      font-family="Arial, sans-serif" 
      font-size="17" 
      fill="#00d4ff" 
      opacity="0.9">@daily_by_jarvis</text>

    <!-- Top right badge -->
    <rect x="${width - 160}" y="16" width="144" height="36" rx="18" fill="#000000" opacity="0.6"/>
    <rect x="${width - 160}" y="16" width="144" height="36" rx="18" fill="none" stroke="#00d4ff" stroke-width="1.5"/>
    <text x="${width - 88}" y="39" 
      font-family="Arial, sans-serif" 
      font-size="14" 
      font-weight="bold"
      text-anchor="middle"
      fill="#00d4ff">⚡ AI Daily</text>
  </svg>`;

  const watermarkBuffer = Buffer.from(watermarkSvg);

  const result = await sharp(imageBuffer)
    .resize(1024, 1024, { fit: 'cover' })
    .composite([{
      input: watermarkBuffer,
      top: 0,
      left: 0,
    }])
    .jpeg({ quality: 90 })
    .toBuffer();

  return result;
}

module.exports = { addWatermark };
