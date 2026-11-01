param([Alias('DownloadMap')][switch]$DownloadKerala)
$ErrorActionPreference = 'Stop'
$dataPath = Join-Path $PSScriptRoot 'data'
$mapPath = Join-Path $dataPath 'map.osm.pbf'
$image = 'ghcr.io/project-osrm/osrm-backend:v5.27.1'
$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
$dockerExe = if ($dockerCommand) { $dockerCommand.Source } else {
    Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe'
}
if (-not (Test-Path -LiteralPath $dockerExe)) {
    throw 'Docker Desktop is required. Install it, start its Linux container engine, and reopen your terminal.'
}
& $dockerExe info --format '{{.ServerVersion}}'
if ($LASTEXITCODE -ne 0) { throw 'Docker engine is not available.' }
& $dockerExe compose version
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose is required. Enable it in Docker Desktop.' }
Write-Host "Checking OSRM image: $image"
& $dockerExe pull $image
if ($LASTEXITCODE -ne 0) { throw "Unable to pull OSRM image $image. Check access to ghcr.io and retry." }
if ($DownloadKerala -and -not (Test-Path -LiteralPath $mapPath)) {
    # Geofabrik publishes Southern Zone, including Kerala, with no state subregions.
    # Keep -DownloadKerala for compatibility with existing setup commands.
    # Source: https://download.geofabrik.de/asia/india/southern-zone.html
    $downloadUrl = 'https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf'
    Write-Host 'Downloading Geofabrik Southern Zone (includes Kerala; approximately 533 MB).'
    Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile "$mapPath.download"
    Move-Item -LiteralPath "$mapPath.download" -Destination $mapPath
}
if (-not (Test-Path -LiteralPath $mapPath)) {
    throw 'Place a Kochi/Kerala OSM extract at osrm/data/map.osm.pbf, or pass -DownloadKerala.'
}
& $dockerExe run --rm -v "${dataPath}:/data" -v "${PSScriptRoot}:/profiles:ro" $image osrm-extract -p /profiles/ambulance.lua /data/map.osm.pbf
if ($LASTEXITCODE -ne 0) { throw 'OSRM extraction failed.' }
& $dockerExe run --rm -v "${dataPath}:/data" $image osrm-partition /data/map.osrm
if ($LASTEXITCODE -ne 0) { throw 'OSRM partition failed.' }
& $dockerExe run --rm -v "${dataPath}:/data" $image osrm-customize /data/map.osrm
if ($LASTEXITCODE -ne 0) { throw 'OSRM customization failed.' }
& $dockerExe compose -f (Join-Path $PSScriptRoot 'docker-compose.yml') up -d
if ($LASTEXITCODE -ne 0) { throw 'OSRM service startup failed.' }
Write-Host 'Waiting for the local OSRM service to accept requests...'
$isReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $probe = Invoke-RestMethod 'http://127.0.0.1:5000/nearest/v1/driving/76.2673,9.9312?number=1' -TimeoutSec 2
        if ($probe.code -eq 'Ok' -and $probe.waypoints.Count -gt 0) { $isReady = $true; break }
    }
    catch { Write-Verbose 'OSRM is still loading the prepared graph.' }
    Start-Sleep -Seconds 1
}
if (-not $isReady) { throw 'OSRM did not become ready. Inspect docker compose logs before continuing.' }
Write-Host 'OSRM is ready. Run python -m scripts.check_osrm to verify Route and Table as well.'
