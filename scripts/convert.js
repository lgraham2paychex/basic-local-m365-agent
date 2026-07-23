const sharp = require('sharp');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');

async function conv(inName, outName, size) {
  const inPath = path.join(assetsDir, inName);
  const outPath = path.join(assetsDir, outName);
  try {
    await sharp(inPath)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPath);
    console.log('Wrote', outPath);
  } catch (err) {
    console.error('Error converting', inPath, err);
    process.exitCode = 2;
  }
}

(async () => {
  await conv('icon-32-outline.svg','icon-32-outline.png',32);
  await conv('icon-192-full.svg','icon-192-full.png',192);
  await conv('icon-32-full.svg','icon-32-full.png',32);
})();
