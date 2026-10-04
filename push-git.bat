@echo off
REM ==================================================================
REM  Ma Bibliotheque BD - Pousser sur GitHub (add + commit + push)
REM ==================================================================
setlocal
cd /d "%~dp0"

echo.
echo ==================================================================
echo   Pousser les modifications sur GitHub
echo ==================================================================
echo.

REM -- Verifier que git est disponible --
git --version >nul 2>&1
if errorlevel 1 (
    echo ERREUR : git introuvable. Installez Git puis relancez.
    pause
    exit /b 1
)

REM -- Message de commit : argument du script, sinon date/heure --
set "MSG=%~1"
if "%MSG%"=="" set "MSG=Maj %DATE% %TIME%"

echo Fichiers modifies :
git status --short
echo.

REM -- Rien a committer ? --
git diff --quiet --cached
git diff --quiet
if not errorlevel 1 (
    REM  (si les deux diff sont vides, add ne changera rien, on verifie apres add)
)

echo Ajout des fichiers...
git add -A

REM -- S'il n'y a vraiment rien a committer, on s'arrete proprement --
git diff --cached --quiet
if not errorlevel 1 (
    echo [i] Rien a committer : le depot est deja a jour.
    echo.
    pause
    exit /b 0
)

echo Commit : "%MSG%"
git commit -m "%MSG%"
if errorlevel 1 (
    echo ERREUR : echec du commit.
    pause
    exit /b 1
)

echo Envoi vers GitHub ^(git push^)...
git push
if errorlevel 1 (
    echo ERREUR : echec du push. Verifiez votre connexion / authentification GitHub.
    pause
    exit /b 1
)

echo.
echo ==================================================================
echo   OK : pousse sur GitHub. Vercel va redeployer automatiquement.
echo ==================================================================
echo.
pause
endlocal
