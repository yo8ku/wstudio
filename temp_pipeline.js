const path = require('path');
const fs = require('fs');
const { fileURLToPath } = require('url');
const original = path.resolve('temp_wall/壁纸/【哲风壁纸】懒羊羊-睡觉.png');
console.log('original', original);
let normalizedPath = original.replace(/\\/g, '/');
const driveLetter = normalizedPath.substring(0, 2);
let pathWithoutDrive = normalizedPath.substring(2);
if (!pathWithoutDrive.startsWith('/')) pathWithoutDrive = '/' + pathWithoutDrive;
const encodedParts = pathWithoutDrive
  .split('/')
  .filter(Boolean)
  .map((part) => encodeURIComponent(part));
const encodedPath = encodedParts.join('/');
const localFileUrl = `local-file://${driveLetter}/${encodedPath}`;
console.log('localFileUrl', localFileUrl);
let normalizedUrl = localFileUrl.replace(/^local-file:/i, 'file:');
normalizedUrl = normalizedUrl.replace(/^file:\/\/([a-zA-Z]:)/, 'file:///$1');
const resolved = fileURLToPath(normalizedUrl);
console.log('resolved', resolved);
console.log(
  'codes',
  resolved.split('').map((ch) => ch.charCodeAt(0).toString(16))
);
console.log('equal', resolved === original);
console.log('original exists', fs.existsSync(original));
console.log('exists', fs.existsSync(resolved));
