param(
    [switch]$PrepareOSRM,
    [Alias('DownloadMap')][switch]$DownloadKerala,
    [switch]$NoReload,
    [ValidateRange(1024, 65535)][int]$Port = 8000
)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path $PSScriptRoot -Parent
$pythonPath = Join-Path $projectPath 'qiskit-env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw 'Create qiskit-env and install requirements.txt first. See README.md.'
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw 'Node.js 22 or newer with npm is required to build the map.'
}
if ($DownloadKerala -and -not $PrepareOSRM) {
    throw 'Use -DownloadKerala together with -PrepareOSRM.'
}
Push-Location $projectPath
try {
    if (-not (Test-Path -LiteralPath 'frontend\node_modules\leaflet\dist\leaflet.js')) {
        npm.cmd --prefix frontend ci --ignore-scripts
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    }
    npm.cmd --prefix frontend run build
    if ($LASTEXITCODE -ne 0) { throw 'Map build failed.' }
    if ($PrepareOSRM) {
        & (Join-Path $projectPath 'osrm\prepare.ps1') -DownloadKerala:$DownloadKerala
        & $pythonPath -m scripts.build_road_index osrm/data/map.osm.pbf data/road_network/roads.json
        if ($LASTEXITCODE -ne 0) { throw 'Road attribute extraction failed.' }
        & $pythonPath -m scripts.check_osrm
        if ($LASTEXITCODE -ne 0) { throw 'OSRM verification failed; the app has not been started.' }
    }
    $indexPath = Join-Path $projectPath 'data\road_network\roads.json'
    if (-not $env:ROAD_INDEX_PATH -and (Test-Path -LiteralPath $indexPath)) {
        $env:ROAD_INDEX_PATH = $indexPath
    }
    Write-Host "Open http://127.0.0.1:$Port/ in your browser. Press Ctrl+C to stop."
    if (-not $env:ROAD_INDEX_PATH) {
        Write-Warning 'Road attributes are not configured. Unknown restrictions will be shown in route results.'
    }
    $serverArgs = @('-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', $Port)
    if (-not $NoReload) { $serverArgs += @('--reload', '--reload-dir', 'backend') }
    & $pythonPath @serverArgs
    if ($LASTEXITCODE -ne 0) { throw 'API startup failed.' }
}
finally {
    Pop-Location
}
