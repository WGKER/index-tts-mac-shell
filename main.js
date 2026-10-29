const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');

let mainWindow;
let backendProc = null;

function waitPort(host, port, timeout = 90000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      const sock = new net.Socket();
      sock.setTimeout(800);
      sock.on('connect', () => { sock.destroy(); resolve(true); });
      sock.on('error', () => {
        sock.destroy();
        if(Date.now() - start > timeout) reject(new Error('Backend timeout 90s'));
        else setTimeout(check, 1000);
      });
      sock.connect(port, host);
    }
    check();
  });
}

function startBackend() {
  // 打包后：main.js 在 Resources/app/main.js
  // venv python 在 Resources/index-tts/.venv/bin/python
  const resourcesRoot = path.join(__dirname, '..');
  const pythonPath = path.join(resourcesRoot, 'index-tts', '.venv', 'bin', 'python');
  const webuiPath = path.join(resourcesRoot, 'index-tts', 'webui.py');
  const cwd = path.join(resourcesRoot, 'index-tts');

  console.log("pythonPath:", pythonPath);
  console.log("webuiPath:", webuiPath);
  console.log("cwd:", cwd);

  if (!fs.existsSync(pythonPath)) {
    console.error("❌ venv python不存在：", pythonPath);
    return;
  }
  if (!fs.existsSync(webuiPath)) {
    console.error("❌ webui.py不存在：", webuiPath);
    return;
  }

  backendProc = spawn(pythonPath, [
    webuiPath,
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
    await waitPort("127.0.0.1", 7860, 90000);
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
