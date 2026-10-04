# Installe une fonction PowerShell "push" pour ce projet.
# A lancer UNE SEULE FOIS :  powershell -ExecutionPolicy Bypass -File .\install-push-alias.ps1
$proj = $PSScriptRoot
$profileDir = Split-Path $PROFILE
if (!(Test-Path $profileDir)) { New-Item -ItemType Directory -Path $profileDir -Force | Out-Null }
$line = "function push { & '$proj\push-git.bat' @args }"
if (!(Test-Path $PROFILE) -or -not (Select-String -Path $PROFILE -SimpleMatch "function push {" -ErrorAction SilentlyContinue)) {
    Add-Content -Path $PROFILE -Value $line
    Write-Host "OK : tape 'push' (ou push \"message\") depuis PowerShell dans ce dossier. Rouvre PowerShell d'abord." -ForegroundColor Green
} else {
    Write-Host "Alias deja installe." -ForegroundColor Yellow
}
