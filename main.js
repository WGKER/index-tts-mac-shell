const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');

let mainWindow;
let backendProc = null;

function waitPort(host, port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      const sock = new net.Socket();
      sock.setTimeout(800);
      sock.on('connect', () => { sock.destroy(); resolve(true); });
      sock.on('error', () => {
        sock.destroy();
        if(Date.now() - start > timeout) reject(new Error('Backend timeout 30s'));
        else setTimeout(check, 1000);
      });
      sock.connect(port, host);
    }
    check();
  });
}

function startBackend() {
  const uvPath = path.join(__dirname, '../uv');
  const cwd = path.join(__dirname, '../index-tts');

  console.log("uvPath:", uvPath);
  console.log("cwd:", cwd);

  if (!fs.existsSync(uvPath)) {
    console.error("❌ uv不存在：", uvPath);
    return;
  }
  if (!fs.existsSync(cwd)) {
    console.error("❌ index-tts目录不存在：", cwd);
    return;
  }

  backendProc = spawn(uvPath, [
    'run',
    'webui.py',
    '--fp16',
    '--no-deepspeed',
    '--device',
    'mps'
  ], {
    cwd: cwd,
    env: {
      ...process.env,
      HF_ENDPOINT: "https://hf-mirror.com"
    }
  });

  backendProc.stdout.on('data', d => console.log(d.toString()));
  backendProc.stderr.on('data', d => console.error(d.toString()));
  backendProc.on('close', code => {
    console.log('backend exit code:', code);
    backendProc = null;
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "INDEX TTS 启动中...",
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  mainWindow.show();

  try {
    await waitPort("127.0.0.1", 7860, 30000);
    mainWindow.setTitle("INDEX TTS 文字转语音");
    mainWindow.loadURL("http://127.0.0.1:7860");
  } catch (err) {
    console.error("后端启动失败：", err);
    mainWindow.loadURL(`data:text/html;charset=utf-8,
      <h2>后端启动失败/超时</h2>
      <p>模型放置路径：Contents/Resources/index-tts/checkpoints</p>
      <p>日志：${err.message}</p>
    `);
  }
  mainWindow.on('closed', () => mainWindow = null);
}

app.whenReady().then(async () => {
  startBackend();
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backendProc) backendProc.kill('SIGTERM');
  if (process.platform !== 'darwin') app.quit();
});
app.on('quit', () => {
  if (backendProc) backendProc.kill('SIGTERM');
});
