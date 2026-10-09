// 启动器：清掉可能干扰 Electron 启动的环境变量，再拉起应用
const { spawn } = require('child_process');

const electronPath = require('electron'); // 返回 electron 二进制路径（字符串）
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE; // 若被设成 1，electron 会退化为普通 node

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env, windowsHide: false });

child.on('close', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code == null ? 0 : code);
});
