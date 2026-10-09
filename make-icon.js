// 生成打包所需的应用图标文件：build/icon.png（512）与 build/icon.ico（256）
const fs = require('fs');
const path = require('path');
const { createAppIcon } = require('./icon');

const buildDir = path.join(__dirname, 'build');
fs.mkdirSync(buildDir, { recursive: true });

// PNG 512x512（mac / linux 用）
fs.writeFileSync(path.join(buildDir, 'icon.png'), createAppIcon(512));

// ICO：嵌入 256x256 的 PNG（Windows 用）
const icoPng = createAppIcon(256);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // count
const entry = Buffer.alloc(16);
entry[0] = 0; // width 256
entry[1] = 0; // height 256
entry[2] = 0; // color count
entry[3] = 0; // reserved
entry.writeUInt16LE(1, 4);  // planes
entry.writeUInt16LE(32, 6); // bit count
entry.writeUInt32LE(icoPng.length, 8);  // size
entry.writeUInt32LE(22, 12); // offset
fs.writeFileSync(path.join(buildDir, 'icon.ico'), Buffer.concat([header, entry, icoPng]));

console.log('已生成图标：');
console.log('  build/icon.png (', fs.statSync(path.join(buildDir, 'icon.png')).size, 'bytes )');
console.log('  build/icon.ico (', fs.statSync(path.join(buildDir, 'icon.ico')).size, 'bytes )');
