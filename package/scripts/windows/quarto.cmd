@ECHO OFF

SETLOCAL

SET SCRIPT_DIR=%~dp0
SET DEV_PATH=..\..\..\src\

SET SRC_PATH=%SCRIPT_DIR%%DEV_PATH%
SET QUARTO_TS_PATH=%SRC_PATH%quarto.ts

IF EXIST "%QUARTO_TS_PATH%" (
	
	IF "%QUARTO_ACTION%"=="" (
		SET QUARTO_ACTION=run
	)
	SET QUARTO_IMPORT_ARGMAP=--importmap="%SRC_PATH%import_map.json"

	IF "%QUARTO_TARGET%"=="" (
		SET QUARTO_TARGET="%QUARTO_TS_PATH%"
	)
	
	SET "QUARTO_BIN_PATH=%SCRIPT_DIR%"
	SET "QUARTO_SHARE_PATH=%SRC_PATH%resources\"
	SET QUARTO_DEBUG=true
) ELSE (
	SET QUARTO_ACTION=run
	SET QUARTO_TARGET="%SCRIPT_DIR%quarto.js"
	SET "QUARTO_BIN_PATH=%SCRIPT_DIR%"
	SET "QUARTO_SHARE_PATH=%SCRIPT_DIR%..\share"
)

echo %PSModulePath% | findstr %USERPROFILE% >NUL
IF %ERRORLEVEL% EQU 0 (
SET NO_COLOR=TRUE
)

SET QUARTO_DENO_OPTIONS=--unstable --allow-read --allow-write --allow-run --allow-env --allow-net --no-check
"%SCRIPT_DIR%deno" %QUARTO_ACTION% %QUARTO_DENO_OPTIONS% %QUARTO_DENO_EXTRA_OPTIONS% %QUARTO_IMPORT_ARGMAP% %QUARTO_TARGET% %*

