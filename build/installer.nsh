; Custom NSIS macros for electron-builder
; Runs after the main install completes.
;
; Purpose: delete the downloaded installer .exe after successful install so the user
; isn't left with a DCTuning-Installer-*.exe file sitting next to their DCTuning shortcut.
; $EXEPATH is the path to the running installer — we can't delete it while running,
; so we spawn a detached cmd that waits for us to exit then deletes it.

!macro customInstallMode
  ; per-machine install default (packaged in package.json; this is documentation only)
  StrCpy $isForceMachineInstall 1
!macroend

!macro customInstall
  ; Schedule self-deletion of the downloaded installer after our process exits.
  ; Uses cmd.exe detached via ExecShell — ping is a trick for "sleep" in cmd (~3s),
  ; then it deletes the installer file and removes itself.
  ExecShell "" "cmd.exe" '/C ping 127.0.0.1 -n 4 >nul & del /f /q "$EXEPATH"' SW_HIDE
!macroend
