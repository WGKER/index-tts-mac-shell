const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

let mainWindow;
let backendProc = null;

// 等待端口就绪
function waitPort(host, port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      const sock = new net.Socket();
      sock.setTimeout(800);
      sock.on('connect', () => {
        sock.destroy();
        resolve(true);
      });
      sock.on('error', () => {
        sock.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error('Backend timeout 30s'));
        } else {
          setTimeout(check, 1000);
        }
      });
      sock.connect(port, host);
    }
    check();
  });
}

function startBackend() {
  // ✅ 关键：包内uv路径，和main.js同级
  const uvPath = path.join(__dirname, 'uv');
  const cwd = path.join(__dirname, 'index-tts');

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
    title: "INDEX TTS 文字转语音",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  try {
    await waitPort("127.0.0.1", 7860, 30000);
    mainWindow.loadURL("http://127.0.0.1:7860");
  } catch (err) {
    console.error(err);
    mainWindow.setTitle("后端启动失败");
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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
