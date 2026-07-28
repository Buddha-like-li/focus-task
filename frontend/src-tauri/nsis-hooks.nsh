!macro NSIS_HOOK_PREINSTALL
  nsExec::ExecToLog 'taskkill /F /T /IM focus-task.exe'
  Pop $0
  Sleep 500
!macroend
