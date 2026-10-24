const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // Since main.js is in /src/main/, preload is in /src/
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Path resolution:
  // __dirname is /home/kass/dv/hackathon/draganscroll/src/main
  // We want /home/kass/dv/hackathon/draganscroll/src/renderer/index.html
  // So we go up one level (..) and then into renderer/
  const indexPath = path.join(__dirname, '../renderer/index.html');
  
  win.loadFile(indexPath).then(() => {
    console.log(`Loaded: ${indexPath}`);
  }).catch(err => {
    console.error("Failed to load index.html:", err);
  });

  win.on('closed', () => {
    app.quit();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
