param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [Parameter(Mandatory = $true)][string]$Portable,
  [Parameter(Mandatory = $true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$portablePath = (Resolve-Path -LiteralPath $Portable).Path
$output = [IO.Path]::GetFullPath($OutputDirectory)
$installation = Join-Path $output 'installed'
$profile = Join-Path $env:LOCALAPPDATA 'dev.rillday.workspace'
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Rillday'
if ((Test-Path -LiteralPath $profile) -or (Test-Path -LiteralPath $uninstallKey) -or (Test-Path -LiteralPath $installation)) {
  throw 'Installer verification requires a clean Windows user profile. Use a disposable VM or CI runner.'
}
New-Item -ItemType Directory -Path $output | Out-Null
$result = @{ checks = @() }
$owned = $null
function Run-Installer([string]$File, [string[]]$Options) {
  try {
    $script:owned = Start-Process -FilePath $File -ArgumentList $Options -WindowStyle Hidden -PassThru
    if (-not $script:owned.WaitForExit(300000)) { throw 'Installer verification timed out' }
    if ($script:owned.ExitCode -ne 0) { throw "Installer exit code: $($script:owned.ExitCode)" }
  } finally {
    if ($script:owned -and -not $script:owned.HasExited) { $script:owned.Kill() }
    $script:owned = $null
  }
}
try {
  Run-Installer $installerPath @('/S', '/NS', "/D=$installation")
  $executable = Join-Path $installation 'rillday-desktop.exe'
  $before = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash
  $portableDirectory = Join-Path $output 'portable'
  Expand-Archive -LiteralPath $portablePath -DestinationPath $portableDirectory
  if ((Get-FileHash -LiteralPath (Join-Path $portableDirectory 'rillday-desktop.exe') -Algorithm SHA256).Hash -ne $before) { throw 'Portable and installed application binaries differ' }
  if ((Get-Content -LiteralPath (Join-Path $portableDirectory 'rillday-data-directory') -Raw).Trim() -ne 'data') { throw 'Portable data folder configuration missing' }
  if ((Get-Content -LiteralPath (Join-Path $portableDirectory 'data/.rillday-data') -Raw).Trim() -ne 'Rillday data directory') { throw 'Portable data folder identity missing' }
  if (-not (Test-Path -LiteralPath (Join-Path $portableDirectory 'LICENSE'))) { throw 'Portable license missing' }
  $result.checks += 'Portable archive contains the identical application, relative data folder and license'
  if (-not (Test-Path -LiteralPath $uninstallKey)) { throw 'Uninstall registration missing' }
  $result.checks += 'Silent current-user installation and uninstall registration'
  New-Item -ItemType Directory -Path $profile -ErrorAction Stop | Out-Null
  $sentinel = Join-Path $profile 'installer-test.txt'
  Set-Content -LiteralPath $sentinel -Value 'Synthetic local data'
  Run-Installer $installerPath @('/S', '/NS', "/D=$installation")
  if ((Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash -ne $before) { throw 'Reinstalled executable differs' }
  if ((Get-Content -LiteralPath $sentinel -Raw).Trim() -ne 'Synthetic local data') { throw 'Reinstall removed local data' }
  $result.checks += 'Reinstallation preserves executable identity and local profile data'
} catch {
  $result.failure = $_.ToString()
  throw
} finally {
  try {
    $uninstaller = Join-Path $installation 'uninstall.exe'
    if (Test-Path -LiteralPath $uninstaller) {
      Run-Installer $uninstaller @('/S')
      # NSIS runs a temporary child uninstaller after its original process exits.
      $deadline = [DateTime]::UtcNow.AddSeconds(30)
      while ((Test-Path -LiteralPath $uninstallKey) -and [DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 200
      }
      if (Test-Path -LiteralPath $uninstallKey) { throw 'Uninstall registration remains' }
      $result.checks += 'Standard uninstallation removes registration'
    }
    if (-not $result.failure) { $result.ok = $true }
  } catch {
    $result.ok = $false
    $result.cleanupFailure = $_.ToString()
    throw
  } finally {
    $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $output 'result.json') -Encoding utf8
  }
}
