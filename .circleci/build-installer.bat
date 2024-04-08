for /f "tokens=1 delims=-" %%i in ("%CIRCLE_TAG%") do set "TAG=%%i.%WORKFLOW_NUM%"
for /f "tokens=1 delims=/" %%j in ("%CIRCLE_TAG%") do set "SEMVER=%%j"
tools\InnoSetup\ISCC.exe tools\powerbi.iss /Sbyparam=$p /DINFO_VERSION=%TAG% /DVERSION=%SEMVER% %*