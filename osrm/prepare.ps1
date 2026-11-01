param([switch]$DownloadKerala)
$ErrorActionPreference = 'Stop'
$dataPath = Join-Path $PSScriptRoot 'data'
$mapPath = Join-Path $dataPath 'map.osm.pbf'
$image = 'osrm/osrm-backend:v5.27.1'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker Desktop is required. Install it and start its Linux container engine first.'
}
docker info --format '{{.ServerVersion}}'
if ($LASTEXITCODE -ne 0) { throw 'Docker engine is not available.' }
if ($DownloadKerala -and -not (Test-Path -LiteralPath $mapPath)) {
    # Downloads the full Kerala extract. A smaller Kochi extract is preferable.
    Invoke-WebRequest 'https://download.geofabrik.de/asia/india/kerala-latest.osm.pbf' -OutFile "$mapPath.download"
    Move-Item -LiteralPath "$mapPath.download" -Destination $mapPath
}
if (-not (Test-Path -LiteralPath $mapPath)) {
    throw 'Place a Kochi/Kerala OSM extract at osrm/data/map.osm.pbf, or pass -DownloadKerala.'
}
docker run --rm -v "${dataPath}:/data" -v "${PSScriptRoot}:/profiles:ro" $image osrm-extract -p /profiles/ambulance.lua /data/map.osm.pbf
if ($LASTEXITCODE -ne 0) { throw 'OSRM extraction failed.' }
docker run --rm -v "${dataPath}:/data" $image osrm-partition /data/map.osrm
if ($LASTEXITCODE -ne 0) { throw 'OSRM partition failed.' }
docker run --rm -v "${dataPath}:/data" $image osrm-customize /data/map.osrm
if ($LASTEXITCODE -ne 0) { throw 'OSRM customization failed.' }
docker compose -f (Join-Path $PSScriptRoot 'docker-compose.yml') up -d
if ($LASTEXITCODE -ne 0) { throw 'OSRM service startup failed.' }
