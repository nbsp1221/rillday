$ErrorActionPreference = 'Stop'
$request = $env:RILLDAY_NATIVE_DIAGNOSTICS | ConvertFrom-Json
$fixture = [IO.Path]::GetFullPath([string]$request.fixture)
$root = [IO.Path]::GetFullPath((Join-Path $env:RILLDAY_TEST_OUTPUT 'native'))
if ([IO.Path]::GetDirectoryName($fixture) -ne $root -or [IO.Path]::GetFileName($fixture) -notmatch '^case-[a-zA-Z0-9]+$') {
  throw 'Diagnostics require a task-owned native fixture'
}
$defaultProfile = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'dev.rillday.workspace.test'))
$profiles = @($request.profiles | ForEach-Object {
  $dataProfile = [IO.Path]::GetFullPath([string]$_)
  if ($dataProfile -ne $defaultProfile -and -not $dataProfile.StartsWith($fixture + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Diagnostics require task-owned WebView profiles'
  }
  Join-Path $dataProfile 'EBWebView'
})

function Get-UserDataFolder($process) {
  $match = [regex]::Match([string]$process.CommandLine, '(?:^|\s)--user-data-dir=(?:"([^"]+)"|(\S+))')
  if ($match.Success) {
    if ($match.Groups[1].Success) { return $match.Groups[1].Value }
    return $match.Groups[2].Value
  }
  return $null
}

$allProcesses = @(Get-CimInstance Win32_Process)
$owned = @{}
foreach ($process in $allProcesses) {
  $rustHost = $process.Name -eq 'rillday-desktop.exe' -and $process.ExecutablePath -and
    $process.ExecutablePath.StartsWith($fixture + '\', [StringComparison]::OrdinalIgnoreCase)
  $webview = $process.Name -eq 'msedgewebview2.exe' -and (Get-UserDataFolder $process) -in $profiles
  if ($rustHost -or $webview) { $owned[[uint32]$process.ProcessId] = $process }
}
do {
  $added = $false
  foreach ($process in $allProcesses) {
    $id = [uint32]$process.ProcessId
    if ($process.Name -eq 'msedgewebview2.exe' -and -not $owned.ContainsKey($id) -and
        $owned.ContainsKey([uint32]$process.ParentProcessId) -and
        $process.CreationDate -ge $owned[[uint32]$process.ParentProcessId].CreationDate) {
      $owned[$id] = $process
      $added = $true
    }
  }
} while ($added)

$listeners = @()
$portError = $null
if ($owned.Count) {
  try {
    $listeners = @(Get-NetTCPConnection -State Listen | Where-Object {
      $owned.ContainsKey([uint32]$_.OwningProcess)
    } | Select-Object LocalAddress, LocalPort, OwningProcess)
  } catch { $portError = $_.Exception.Message }
}
@{
  at = [DateTime]::UtcNow.ToString('o')
  processes = @($owned.Values | Sort-Object ProcessId | ForEach-Object {
    @{
      pid = $_.ProcessId
      parentPid = $_.ParentProcessId
      name = $_.Name
      executable = $_.ExecutablePath
      commandLine = $_.CommandLine
      userDataFolder = Get-UserDataFolder $_
      createdAt = $_.CreationDate.ToUniversalTime().ToString('o')
    }
  })
  listeners = $listeners
  portError = $portError
} | ConvertTo-Json -Depth 6 -Compress
