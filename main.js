const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProc = null;

// 启动 IndexTTS 后端
function startBackend() {
  const cwd = path.join(__dirname, 'index-tts');
  backendProc = spawn('uv', ['run', 'webui.py', '--fp16', '--no-deepspeed', '--device', 'mps'], {
    cwd: cwd,
    shell: true,
    env: {
      ...process.env,
      HF_ENDPOINT: "https://hf-mirror.com"
    }
  });

  backendProc.stdout.on('data', (d) => console.log(d.toString()));
  backendProc.stderr.on('data', (d) => console.error(d.toString()));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "INDEX TTS 文字转语音", // 这里就是窗口顶部标题，随便改
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // 等待后端7860端口就绪再加载页面
  setTimeout(()=>{
    mainWindow.loadURL("http://127.0.0.1:7860");
  }, 6000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backendProc) backendProc.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  if (backendProc) backendProc.kill();
});
