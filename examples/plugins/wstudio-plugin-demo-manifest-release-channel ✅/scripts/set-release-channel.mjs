/**
 * Switches the demo manifest releaseChannel between development and stable.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const nextChannel = process.argv[2];
const allowedChannels = new Set(['development', 'stable']);

async function main() {
  if (!allowedChannels.has(nextChannel)) {
    throw new Error('Expected release channel argument: development | stable');
  }

  const manifestPath = path.join(process.cwd(), 'manifest.json');
  const manifestText = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);

  manifest.releaseChannel = nextChannel;

  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  console.log(`[wstudio-plugin-demo-manifest-release-channel] releaseChannel => ${nextChannel}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
