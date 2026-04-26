; ─────────────────────────────────────────────────────────────────────────────
;  DCTuning Bridge installer
;  ─────────────────────────────────────────────────────────────────────────
;  NSIS script for building DCTuningBridge_Setup.exe — a proper Windows
;  installer that drops DCTuningBridge.exe + j2534helper.exe into Program
;  Files, registers an Add/Remove Programs entry, and (optionally) wires
;  the bridge to start on Windows login.
;
;  Build with:
;    "C:\Program Files (x86)\NSIS\makensis.exe" installer.nsi
;
;  Or via the Node build pipeline:
;    npm run package:installer
; ─────────────────────────────────────────────────────────────────────────────

!define APPNAME       "DCTuning Bridge"
!define COMPANYNAME   "DCTuning Ireland"
!define DESCRIPTION   "Local J2534 hardware service for app.dctuning.ie"
!define VERSIONMAJOR  0
!define VERSIONMINOR  2
!define VERSIONBUILD  0
!define HELPURL       "https://dctuning.ie"
!define UPDATEURL     "https://github.com/dctunings/DCTUNING_APP/releases"
!define ABOUTURL      "https://app.dctuning.ie"
!define INSTALLSIZE   75000   ; KB — approximate after install (66 MB exe + 12 KB helper)

; ── Modern UI ─────────────────────────────────────────────────────────────
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

Name "${APPNAME}"
OutFile "..\releases\DCTuningBridge_Setup_v${VERSIONMAJOR}.${VERSIONMINOR}.${VERSIONBUILD}.exe"
InstallDir "$PROGRAMFILES64\${APPNAME}"
InstallDirRegKey HKLM "Software\${COMPANYNAME}\${APPNAME}" "InstallDir"
RequestExecutionLevel admin    ; Need admin to write Program Files + Run key (HKLM)

!define MUI_ABORTWARNING
!define MUI_ICON "..\resources\icon.ico"
!define MUI_UNICON "..\resources\icon.ico"

; ── Wizard pages ──────────────────────────────────────────────────────────
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "license.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\DCTuningBridge.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Start DCTuning Bridge now"
!define MUI_FINISHPAGE_LINK "Open app.dctuning.ie"
!define MUI_FINISHPAGE_LINK_LOCATION "https://app.dctuning.ie"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ── Install sections ──────────────────────────────────────────────────────
Section "Bridge service (required)" SecCore
  SectionIn RO    ; Read-only — can't be unchecked

  SetOutPath "$INSTDIR"
  File "..\build\DCTuningBridge.exe"
  File "..\build\j2534helper.exe"
  File "license.txt"

  ; ── Add/Remove Programs entry ──────────────────────────────────────────
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "QuietUninstallString" "$\"$INSTDIR\Uninstall.exe$\" /S"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "InstallLocation" "$\"$INSTDIR$\""
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayIcon" "$\"$INSTDIR\DCTuningBridge.exe$\""
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "Publisher" "${COMPANYNAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "HelpLink" "${HELPURL}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "URLUpdateInfo" "${UPDATEURL}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "URLInfoAbout" "${ABOUTURL}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayVersion" "${VERSIONMAJOR}.${VERSIONMINOR}.${VERSIONBUILD}"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "VersionMajor" ${VERSIONMAJOR}
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "VersionMinor" ${VERSIONMINOR}
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "NoRepair" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "EstimatedSize" ${INSTALLSIZE}

  ; Remember install location for future upgrades
  WriteRegStr HKLM "Software\${COMPANYNAME}\${APPNAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\${COMPANYNAME}\${APPNAME}" "Version" "${VERSIONMAJOR}.${VERSIONMINOR}.${VERSIONBUILD}"

  ; Generate uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Start automatically on Windows login" SecAutostart
  ; Adds an HKLM\...\Run entry so the bridge starts for ANY user on this machine
  ; (HKLM is per-machine, HKCU would be per-user — use HKLM since the J2534 DLL
  ;  it talks to is a system-wide install anyway)
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "${APPNAME}" "$\"$INSTDIR\DCTuningBridge.exe$\""
SectionEnd

Section "Start Menu shortcut" SecStartMenu
  CreateDirectory "$SMPROGRAMS\${COMPANYNAME}"
  CreateShortcut  "$SMPROGRAMS\${COMPANYNAME}\${APPNAME}.lnk"  "$INSTDIR\DCTuningBridge.exe" "" "$INSTDIR\DCTuningBridge.exe" 0
  CreateShortcut  "$SMPROGRAMS\${COMPANYNAME}\Uninstall ${APPNAME}.lnk"  "$INSTDIR\Uninstall.exe"
SectionEnd

Section /o "Desktop shortcut" SecDesktop
  ; Off by default — most customers don't want desktop clutter for a service
  CreateShortcut  "$DESKTOP\${APPNAME}.lnk"  "$INSTDIR\DCTuningBridge.exe" "" "$INSTDIR\DCTuningBridge.exe" 0
SectionEnd

; ── Section descriptions (shown when hovering in the Components page) ─────
LangString DESC_SecCore      ${LANG_ENGLISH} "DCTuningBridge.exe + j2534helper.exe — required for any J2534 access from app.dctuning.ie."
LangString DESC_SecAutostart ${LANG_ENGLISH} "Recommended. Runs the bridge automatically every time Windows starts. Without this you must launch it manually."
LangString DESC_SecStartMenu ${LANG_ENGLISH} "Adds 'DCTuning Bridge' under Start Menu / DCTuning Ireland for manual launch."
LangString DESC_SecDesktop   ${LANG_ENGLISH} "Adds a 'DCTuning Bridge' icon on your desktop."

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecCore}      $(DESC_SecCore)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecAutostart} $(DESC_SecAutostart)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecStartMenu} $(DESC_SecStartMenu)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop}   $(DESC_SecDesktop)
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; ── Pre-install: kill any running bridge so we can overwrite the exe ──────
Function .onInit
  ; Kill any running bridge before installing — overwrite of a running exe fails
  ExecWait 'taskkill /F /IM DCTuningBridge.exe /T' $0
  Sleep 500
FunctionEnd

; ── Uninstaller ───────────────────────────────────────────────────────────
Section "Uninstall"
  ; Stop the bridge if running
  ExecWait 'taskkill /F /IM DCTuningBridge.exe /T' $0
  Sleep 500

  ; Remove files
  Delete "$INSTDIR\DCTuningBridge.exe"
  Delete "$INSTDIR\j2534helper.exe"
  Delete "$INSTDIR\license.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir  "$INSTDIR"

  ; Remove shortcuts
  Delete "$SMPROGRAMS\${COMPANYNAME}\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${COMPANYNAME}\Uninstall ${APPNAME}.lnk"
  RMDir  "$SMPROGRAMS\${COMPANYNAME}"
  Delete "$DESKTOP\${APPNAME}.lnk"

  ; Remove registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "${APPNAME}"
  DeleteRegKey HKLM "Software\${COMPANYNAME}\${APPNAME}"
  DeleteRegKey /ifempty HKLM "Software\${COMPANYNAME}"
SectionEnd
