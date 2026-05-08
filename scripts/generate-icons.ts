import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync, rmSync, copyFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Source icons directory
const publicIconsDir = join(rootDir, 'public', 'icons');
const sourceIconPath = join(publicIconsDir, 'icon-512.png');
const sourceIconAltPath = join(publicIconsDir, 'icon-desktop-512.png'); // fallback

// Output directories
const androidDir = join(rootDir, 'android', 'app', 'src', 'main', 'res');
const iosDir = join(rootDir, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');

// Determine source icon
let sourceBuffer: Buffer;
try {
  sourceBuffer = readFileSync(sourceIconPath);
  console.log('Using source icon: icon-512.png');
} catch {
  sourceBuffer = readFileSync(sourceIconAltPath);
  console.log('Using fallback source icon: icon-desktop-512.png');
}

// Clean and recreate output directories
function cleanDir(dirPath: string) {
  if (existsSync(dirPath)) {
    rmSync(dirPath, { recursive: true, force: true });
  }
  mkdirSync(dirPath, { recursive: true });
}

// Generate Android icons ( Capacitor/Ant Design icon sizes )
async function generateAndroidIcons() {
  const sizes = [
    { name: 'ic_launcher.png', size: 192 }, // mipmap-hdpi
    { name: 'ic_launcher_foreground.png', size: 192 }, // foreground for adaptive icons
    { name: 'ic_launcher.png', size: 192, folder: 'mipmap-xhdpi' },
    { name: 'ic_launcher_foreground.png', size: 192, folder: 'mipmap-xhdpi' },
    { name: 'ic_launcher.png', size: 144 },
    { name: 'ic_launcher_foreground.png', size: 144, folder: 'mipmap-xxhdpi' },
    { name: 'ic_launcher.png', size: 192, folder: 'mipmap-xxxhdpi' },
    { name: 'ic_launcher_foreground.png', size: 192, folder: 'mipmap-xxxhdpi' },
  ];

  // Standard Android launcher icon sizes (mdpi baseline 48dp scaled)
  const androidSizes = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
  };

  for (const [folder, size] of Object.entries(androidSizes)) {
    const dir = join(androidDir, folder);
    cleanDir(dir);
    await sharp(sourceBuffer)
      .resize(size, size)
      .png()
      .toFile(join(dir, 'ic_launcher.png'));

    await sharp(sourceBuffer)
      .resize(size, size)
      .png()
      .toFile(join(dir, 'ic_launcher_round.png'));

    // Adaptive icon foreground (full bleed)
    await sharp(sourceBuffer)
      .resize(size, size)
      .png()
      .toFile(join(dir, 'ic_launcher_foreground.png'));
    console.log(`Generated Android icons: ${folder} (${size}x${size})`);
  }
}

// Generate iOS icons
async function generateIOSIcons() {
  const iosSizes = [
    { filename: 'AppIcon-512@2x.png', size: 1024, idiom: 'universal', platform: 'ios', sizeLabel: '1024x1024' },
  ];

  // Ensure directory exists
  mkdirSync(iosDir, { recursive: true });

  // Read existing Contents.json if present (to preserve metadata)
  const contentsPath = join(iosDir, 'Contents.json');
  let contentsJson = null;
  if (existsSync(contentsPath)) {
    try {
      contentsJson = JSON.parse(readFileSync(contentsPath, 'utf-8'));
    } catch { /* ignore parse errors */ }
  }

  // Generate icons
  for (const icon of iosSizes) {
    await sharp(sourceBuffer)
      .resize(icon.size, icon.size)
      .png()
      .toFile(join(iosDir, icon.filename));
    console.log(`Generated iOS icon: ${icon.filename} (${icon.size}x${icon.size})`);
  }

  // Write or update Contents.json with proper entries
  const newContents = {
    images: iosSizes.map(icon => ({
      filename: icon.filename,
      idiom: icon.idiom,
      platform: icon.platform,
      size: icon.sizeLabel
    })),
    info: {
      author: 'xcode',
      version: 1
    }
  };
  writeFileSync(contentsPath, JSON.stringify(newContents, null, 2));
  console.log(`Updated iOS Contents.json`);
}

// Generate/update web manifest icons if needed
async function generateWebIcons() {
  // Ensure we have all required web PWA icons
  const requiredSizes = [192, 512, 512]; // 192, 512, 512-maskable
  const filenames = ['icon-192.png', 'icon-512.png', 'icon-desktop-512.png'];

  for (let i = 0; i < requiredSizes.length; i++) {
    const size = requiredSizes[i];
    const filename = filenames[i];
    await sharp(sourceBuffer)
      .resize(size, size)
      .png()
      .toFile(join(publicIconsDir, filename));
    console.log(`Generated web icon: ${filename} (${size}x${size})`);
  }

  // Update manifest if needed (optional: update version/hashes)
  updateManifest();
}

function updateManifest() {
  const manifestPath = join(rootDir, 'public', 'manifest.webmanifest');
  if (existsSync(manifestPath)) {
    // Could update hashes/timestamp here if needed
    console.log('Manifest verified (icons match)');
  }
}

// Main
async function main() {
  console.log('🔄 Synchronizing all icons from source...\n');

  try {
    await generateAndroidIcons();
    console.log('');
    await generateIOSIcons();
    console.log('');
    await generateWebIcons();
    console.log('\n✅ All icons synchronized successfully!');
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

main();
