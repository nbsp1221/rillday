#Requires -Version 7.0
param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [Parameter(Mandatory = $true)][string]$Archive,
  [Parameter(Mandatory = $true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$archivePath = (Resolve-Path -LiteralPath $Archive).Path
$output = [IO.Path]::GetFullPath($OutputDirectory)
$installation = Join-Path $output 'installed'
$profile = Join-Path $env:LOCALAPPDATA 'dev.rillday.workspace'
$configuration = Join-Path $env:APPDATA 'dev.rillday.workspace'
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Rillday'
if ((Test-Path -LiteralPath $profile) -or (Test-Path -LiteralPath $configuration) -or (Test-Path -LiteralPath $uninstallKey) -or (Test-Path -LiteralPath $installation)) {
  throw 'Installer verification requires a clean Windows user profile. Use a disposable VM or CI runner.'
}
New-Item -ItemType Directory -Path $output | Out-Null
$result = @{ checks = @() }
$owned = $null
Add-Type -AssemblyName UIAutomationClient
function Test-Startup([string]$Executable) {
  $start = [Diagnostics.ProcessStartInfo]::new($Executable)
  $start.UseShellExecute = $false
  $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
  $application = [Diagnostics.Process]::Start($start)
  $window = $null
  $rendered = $false
  try {
    $applicationWindow = [System.Windows.Automation.AndCondition]::new(
      [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $application.Id),
      [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, 'Rillday')
    )
    $heading = [System.Windows.Automation.OrCondition]::new(
      [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, 'Choose where to keep your work'),
      [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, '자료를 보관할 위치를 선택하세요')
    )
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([DateTime]::UtcNow -lt $deadline) {
      $application.Refresh()
      if ($application.HasExited) { throw "Application exited during startup: $($application.ExitCode)" }
      # The single-instance plugin also owns a window, so select the actual application by identity.
      $window = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $applicationWindow)
      if ($window -and $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $heading)) {
        $rendered = $true
        $result.checks += "First-run screen renders from $([IO.Path]::GetFileName([IO.Path]::GetDirectoryName($Executable)))"
        return
      }
      Start-Sleep -Milliseconds 100
    }
    throw 'Application did not render its first-run screen'
  } finally {
    try {
      if (-not $application.HasExited) {
        if ($window) {
          try { $window.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern).Close() }
          catch { Write-Warning "Could not close the application window: $_" }
        }
        if (-not $application.WaitForExit(15000)) {
          $application.Kill($true)
          if ($rendered) { throw 'Application did not close after the startup check' }
          Write-Warning 'Stopped the application after the failed startup check'
        }
      }
    } finally { $application.Dispose() }
  }
}
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
  $archiveDirectory = Join-Path $output 'archive'
  Expand-Archive -LiteralPath $archivePath -DestinationPath $archiveDirectory
  if ((Get-FileHash -LiteralPath (Join-Path $archiveDirectory 'rillday-desktop.exe') -Algorithm SHA256).Hash -ne $before) { throw 'ZIP and installed application binaries differ' }
  if ((Test-Path -LiteralPath (Join-Path $archiveDirectory 'rillday-data-directory')) -or (Test-Path -LiteralPath (Join-Path $archiveDirectory 'data'))) { throw 'ZIP distribution must not select a separate workspace' }
  if (-not (Test-Path -LiteralPath (Join-Path $archiveDirectory 'LICENSE'))) { throw 'ZIP license missing' }
  $result.checks += 'ZIP archive contains the identical application and license without a separate storage policy'
  if (-not (Test-Path -LiteralPath $uninstallKey)) { throw 'Uninstall registration missing' }
  $result.checks += 'Silent current-user installation and uninstall registration'
  New-Item -ItemType Directory -Path $profile -ErrorAction Stop | Out-Null
  $sentinel = Join-Path $profile 'installer-test.txt'
  Set-Content -LiteralPath $sentinel -Value 'Synthetic local data'
  Test-Startup $executable
  Run-Installer $installerPath @('/S', '/NS', "/D=$installation")
  if ((Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash -ne $before) { throw 'Reinstalled executable differs' }
  if ((Get-Content -LiteralPath $sentinel -Raw).Trim() -ne 'Synthetic local data') { throw 'Reinstall removed local data' }
  $result.checks += 'Reinstallation preserves executable identity and local profile data'
  Test-Startup (Join-Path $archiveDirectory 'rillday-desktop.exe')
} catch {
  $result.failure = $_.ToString()
  throw
} finally {
  try {
    $uninstaller = Join-Path $installation 'uninstall.exe'
    if (-not $result.failure -and -not (Test-Path -LiteralPath $uninstaller)) { throw 'Uninstaller missing' }
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
    if (-not $result.failure) {
      if (Test-Path -LiteralPath $uninstallKey) { throw 'Uninstall registration remains' }
      $result.ok = $true
    }
  } catch {
    $result.ok = $false
    $result.cleanupFailure = $_.ToString()
    if (-not $result.failure) { throw }
  } finally {
    try {
      $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $output 'result.json') -Encoding utf8
    } catch {
      if (-not $result.failure -and -not $result.cleanupFailure) { throw }
      Write-Warning $_.ToString()
    }
  }
}
