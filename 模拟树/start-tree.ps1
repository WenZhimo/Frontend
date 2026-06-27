param(
  [int]$PreferredPort = 5173,
  [int]$PortProbeCount = 32
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$StateDir = Join-Path $ProjectRoot '.launcher'
$LogDir = Join-Path $StateDir 'logs'
$UrlFile = Join-Path $StateDir 'url.txt'
$PortFile = Join-Path $StateDir 'port.txt'
$PidFile = Join-Path $StateDir 'server.pid'

New-Item -ItemType Directory -Force -Path $StateDir, $LogDir | Out-Null

function Write-Info {
  param([string]$Message)
  Write-Host "[tree-launcher] $Message" -ForegroundColor Cyan
}

function Write-Warn {
  param([string]$Message)
  Write-Host "[tree-launcher] $Message" -ForegroundColor Yellow
}

function Write-Fail {
  param([string]$Message)
  Write-Host "[tree-launcher] $Message" -ForegroundColor Red
}

function Get-ShortHash {
  param([string]$Text)

  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $hash = $sha.ComputeHash($bytes)
    return ([BitConverter]::ToString($hash) -replace '-', '').Substring(0, 16)
  } finally {
    $sha.Dispose()
  }
}

function Test-TcpPort {
  param([int]$Port)

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $result = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    if (-not $result.AsyncWaitHandle.WaitOne(250)) {
      return $false
    }
    $client.EndConnect($result)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Test-HttpUrl {
  param([string]$Url)

  if ([string]::IsNullOrWhiteSpace($Url)) {
    return $false
  }

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Open-TreeUrl {
  param([string]$Url)

  if (-not [string]::IsNullOrWhiteSpace($Url)) {
    Start-Process $Url | Out-Null
  }
}

function Read-LiveStoredUrl {
  if (-not (Test-Path -LiteralPath $UrlFile)) {
    return $null
  }

  $url = (Get-Content -LiteralPath $UrlFile -Raw).Trim()
  if (Test-HttpUrl $url) {
    return $url
  }

  return $null
}

function Wait-ForStoredUrl {
  param([int]$TimeoutSeconds)

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $url = Read-LiveStoredUrl
    if ($url) {
      return $url
    }
    Start-Sleep -Milliseconds 700
  }

  return $null
}

function Get-NodePath {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($node) {
    return $node.Source
  }

  $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npmCmd) {
    $candidate = Join-Path (Split-Path -Parent $npmCmd.Source) 'node.exe'
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  $candidatePaths = @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
    (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
  )

  foreach ($candidate in $candidatePaths) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  throw 'node.exe was not found. Install Node.js LTS, then run this launcher again.'
}

function Get-NpmPath {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) {
    $npm = Get-Command npm -ErrorAction SilentlyContinue
  }
  if (-not $npm) {
    throw 'npm was not found. Install Node.js LTS, then run this launcher again.'
  }
  return $npm.Source
}

function Ensure-NodeOnPath {
  param([string]$NodePath)

  $nodeDir = Split-Path -Parent $NodePath
  $pathParts = $env:PATH -split ';'
  if ($pathParts -notcontains $nodeDir) {
    $env:PATH = "$nodeDir;$env:PATH"
  }
}

function Ensure-Dependencies {
  param([string]$NpmPath)

  $nodeModules = Join-Path $ProjectRoot 'node_modules'
  $viteBin = Join-Path $ProjectRoot 'node_modules\.bin\vite.cmd'
  if ((Test-Path -LiteralPath $nodeModules) -and (Test-Path -LiteralPath $viteBin)) {
    return
  }

  Write-Info 'Dependencies are missing. Running npm install...'
  & $NpmPath install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed with exit code $LASTEXITCODE."
  }
}

function Get-FreePort {
  param(
    [int]$StartPort,
    [int]$Count
  )

  for ($port = $StartPort; $port -lt ($StartPort + $Count); $port += 1) {
    if (-not (Test-TcpPort $port)) {
      return $port
    }
  }

  throw "Ports $StartPort through $($StartPort + $Count - 1) are all in use."
}

function Save-ServerState {
  param(
    [int]$Port,
    [string]$Url,
    [int]$ServerProcessId
  )

  Set-Content -LiteralPath $PortFile -Value $Port -Encoding ascii
  Set-Content -LiteralPath $UrlFile -Value $Url -Encoding ascii
  Set-Content -LiteralPath $PidFile -Value $ServerProcessId -Encoding ascii
}

function Get-RecordedProcess {
  if (-not (Test-Path -LiteralPath $PidFile)) {
    return $null
  }

  $rawPid = (Get-Content -LiteralPath $PidFile -Raw).Trim()
  $recordedPid = 0
  if (-not [int]::TryParse($rawPid, [ref]$recordedPid)) {
    return $null
  }

  return Get-Process -Id $recordedPid -ErrorAction SilentlyContinue
}

function Get-RecordedPort {
  if (-not (Test-Path -LiteralPath $PortFile)) {
    return $null
  }

  $rawPort = (Get-Content -LiteralPath $PortFile -Raw).Trim()
  $recordedPort = 0
  if (-not [int]::TryParse($rawPort, [ref]$recordedPort)) {
    return $null
  }

  return $recordedPort
}

$mutexHash = Get-ShortHash $ProjectRoot.ToLowerInvariant()
$mutexName = "Global\TreeSimulator3D_$mutexHash"
$mutex = [System.Threading.Mutex]::new($false, $mutexName)
$ownsMutex = $false
$currentProcess = $null

try {
  $ownsMutex = $mutex.WaitOne(0)

  if (-not $ownsMutex) {
    Write-Info 'Another launcher is already running. Waiting for the current server...'
    $existingUrl = Wait-ForStoredUrl -TimeoutSeconds 60
    if ($existingUrl) {
      Write-Info "Opening existing page: $existingUrl"
      Open-TreeUrl $existingUrl
      exit 0
    }

    Write-Warn 'The existing launcher is still preparing the server. Try again in a moment.'
    exit 0
  }

  $nodePath = Get-NodePath
  Ensure-NodeOnPath -NodePath $nodePath
  $npmPath = Get-NpmPath

  $liveUrl = Read-LiveStoredUrl
  if ($liveUrl) {
    Write-Info "Opening existing server: $liveUrl"
    Open-TreeUrl $liveUrl
    $recordedProcess = Get-RecordedProcess
    if ($recordedProcess) {
      Write-Info "Taking over watchdog for process ID $($recordedProcess.Id)."
      $recordedProcess.WaitForExit()
      Write-Warn 'The existing server exited. Restarting it now.'
      $recordedPort = Get-RecordedPort
      if ($recordedPort) {
        $PreferredPort = $recordedPort
      }
    } else {
      Write-Warn 'The page is reachable, but no recorded server process was found. Exiting.'
      exit 0
    }
  }

  Remove-Item -LiteralPath $UrlFile, $PortFile, $PidFile -ErrorAction SilentlyContinue
  Ensure-Dependencies -NpmPath $npmPath

  $port = Get-FreePort -StartPort $PreferredPort -Count $PortProbeCount
  $url = "http://127.0.0.1:$port/"
  $openedBrowser = $false
  $restartDelaySeconds = 3

  Write-Info "Project root: $ProjectRoot"
  Write-Info "Server URL: $url"
  Write-Info 'Keep this window open. If the dev server crashes, it will restart automatically.'

  while ($true) {
    $stdoutLog = Join-Path $LogDir "vite-$port.out.log"
    $stderrLog = Join-Path $LogDir "vite-$port.err.log"
    Remove-Item -LiteralPath $stdoutLog, $stderrLog -ErrorAction SilentlyContinue

    $arguments = @('run', 'dev', '--', '--host', '127.0.0.1', '--port', "$port", '--strictPort')
    Write-Info "Starting Vite dev server: $url"
    $currentProcess = Start-Process `
      -FilePath $npmPath `
      -ArgumentList $arguments `
      -WorkingDirectory $ProjectRoot `
      -RedirectStandardOutput $stdoutLog `
      -RedirectStandardError $stderrLog `
      -WindowStyle Hidden `
      -PassThru

    Save-ServerState -Port $port -Url $url -ServerProcessId $currentProcess.Id

    $readyDeadline = (Get-Date).AddSeconds(70)
    while (-not $currentProcess.HasExited -and (Get-Date) -lt $readyDeadline) {
      if (Test-HttpUrl $url) {
        if (-not $openedBrowser) {
          Write-Info "Server is ready. Opening: $url"
          Open-TreeUrl $url
          $openedBrowser = $true
        }
        break
      }
      Start-Sleep -Milliseconds 700
    }

    while (-not $currentProcess.HasExited) {
      if (-not $openedBrowser -and (Test-HttpUrl $url)) {
        Write-Info "Server is ready. Opening: $url"
        Open-TreeUrl $url
        $openedBrowser = $true
      }
      Start-Sleep -Seconds 2
    }

    $exitCode = $currentProcess.ExitCode
    $currentProcess = $null

    $stderrText = ''
    if (Test-Path -LiteralPath $stderrLog) {
      $stderrText = Get-Content -LiteralPath $stderrLog -Raw
    }

    if ($stderrText -match 'EADDRINUSE|Port .* is already in use|address already in use') {
      Write-Warn "Port $port is in use. Switching to the next available port."
      $port = Get-FreePort -StartPort ($port + 1) -Count $PortProbeCount
      $url = "http://127.0.0.1:$port/"
      $openedBrowser = $false
      continue
    }

    Write-Warn "Dev server exited with code $exitCode. Restarting in $restartDelaySeconds seconds."
    Write-Warn "Logs: $stdoutLog / $stderrLog"
    Start-Sleep -Seconds $restartDelaySeconds
  }
} catch {
  Write-Fail $_.Exception.Message
  Write-Host ''
  Read-Host 'Press Enter to exit' | Out-Null
  exit 1
} finally {
  if ($currentProcess -and -not $currentProcess.HasExited) {
    try {
      Stop-Process -Id $currentProcess.Id -Force -ErrorAction SilentlyContinue
    } catch {
      # Best-effort cleanup only.
    }
  }

  if ($ownsMutex) {
    try {
      $mutex.ReleaseMutex()
    } catch {
      # Best-effort cleanup only.
    }
  }
  $mutex.Dispose()
}
