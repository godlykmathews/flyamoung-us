import { readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensions = ['.mp3', '.m4a', '.ogg', '.wav'];
const clips = {
  welcome: ['welcome'],
  service: ['service'],
  seatbelt: ['seatbelt'],
  turbulence: ['turbulence'],
  pressure: ['pressure-warning'],
  smoke: ['smoke-warning'],
  medical: ['pilot-medical'],
  recovery: ['recovery', 'secure'],
  weatherLoop: ['turbulence-loop'],
  maskDrop: ['oxygen-mask-drop'],
  warning: ['cabin-warning'],
  seatbeltChime: ['seatbelt-chime'],
  chime: ['chime', 'service chime', 'service-chime', 'service_chime'],
  safety: ['safety'],
  secure: ['secure'],
  approach: ['approach'],
  emergency: ['emergency'],
  landed: ['landed'],
  water: ['water'], coffee: ['coffee'], meal: ['meal'], blanket: ['blanket'],
};

export async function prepareVoice({ sourceDir = 'voice', outputDir = 'client/public/voice' } = {}) {
  await mkdir(sourceDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  const files = (await readdir(sourceDir, { withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .sort();
  const manifest = {};
  const copied = new Set();
  for (const [cue, aliases] of Object.entries(clips)) {
    const candidate = aliases.flatMap(name => extensions.map(ext => `${name}${ext}`))
      .map(name => files.find(file => file.toLowerCase() === name))
      .find(Boolean);
    if (!candidate) continue;
    if (!copied.has(candidate)) {
      await copyFile(path.join(sourceDir, candidate), path.join(outputDir, candidate));
      copied.add(candidate);
    }
    manifest[cue] = `/voice/${encodeURIComponent(candidate)}`;
  }
  await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, filesCopied: copied.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareVoice();
  console.log(`Prepared ${result.filesCopied} local flight audio files (${Object.keys(result.manifest).length} cue mappings).`);
}
