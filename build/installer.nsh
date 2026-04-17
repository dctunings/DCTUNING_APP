; Custom NSIS macros for electron-builder DCTuning installer.
; Ensures a clean single-click install experience.

!macro customInstallMode
  ; Force per-machine install (C:\Program Files\DCTuning) — matches package.json config.
  StrCpy $isForceMachineInstall 1
!macroend

!macro customInit
  ; Before anything runs — if the DCTuning app is currently open, kill it silently so the
  ; installer doesn't see 'file in use' errors and retry (which makes it look like it runs twice).
  nsExec::Exec 'taskkill /F /IM DCTuning.exe'
  nsExec::Exec 'taskkill /F /IM j2534helper.exe'
  Sleep 500
!macroend

!macro customInstall
  ; After install completes, delete the downloaded installer .exe from wherever the user
  ; ran it from (typically Desktop or Downloads). Can't delete a running process, so spawn
  ; a detached cmd that waits for us to exit first.
  ;
  ; Uses 'timeout' (cleaner than ping trick). SW_HIDE so no visible flash.
  ExecShell "" "cmd.exe" '/C timeout /t 3 /nobreak >nul && del /f /q "$EXEPATH"' SW_HIDE
!macroend
