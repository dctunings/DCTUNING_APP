import { autoUpdater } from 'electron-updater'
import { dialog } from 'electron'
import log from 'electron-log'

export function initUpdater(): void {
  log.transports.file.level = 'info'
  autoUpdater.logger = log

  autoUpdater.on('update-available', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: 'A new version of DCTuning is available. Downloading now...',
      buttons: ['OK'],
    })
  })

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. The application will restart to apply the update.',
      buttons: ['Restart Now', 'Later'],
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall()
      }
    })
  })

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err)
  })

  // Check for updates on startup (don't notify if no update)
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    log.error('Failed to check for updates:', err)
  })
}
