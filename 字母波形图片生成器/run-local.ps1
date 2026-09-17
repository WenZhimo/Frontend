$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 5179
$listener = [System.Net.HttpListener]::new()

while ($true) {
  try {
    $listener.Prefixes.Clear()
    $listener.Prefixes.Add("http://127.0.0.1:$port/")
    $listener.Start()
    break
  }
  catch {
    if ($port -ge 5199) { throw }
    $port += 1
  }
}

$url = "http://127.0.0.1:$port/"
Write-Host "TTS waveform image generator: $url"
Write-Host 'Press Ctrl+C to stop.'
Start-Process $url

function Get-ContentType($path) {
  switch ([System.IO.Path]::GetExtension($path).ToLowerInvariant()) {
    '.html' { return 'text/html; charset=utf-8' }
    '.css' { return 'text/css; charset=utf-8' }
    '.js' { return 'text/javascript; charset=utf-8' }
    '.json' { return 'application/json; charset=utf-8' }
    '.svg' { return 'image/svg+xml' }
    '.png' { return 'image/png' }
    '.jpg' { return 'image/jpeg' }
    '.jpeg' { return 'image/jpeg' }
    '.webp' { return 'image/webp' }
    default { return 'application/octet-stream' }
  }
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $requestPath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart([char]'/'))
    if ([string]::IsNullOrWhiteSpace($requestPath)) { $requestPath = 'index.html' }

    $localPath = [System.IO.Path]::GetFullPath((Join-Path $root $requestPath))
    $rootPath = [System.IO.Path]::GetFullPath($root)
    $rootPrefix = if ($rootPath.EndsWith([System.IO.Path]::DirectorySeparatorChar)) { $rootPath } else { "$rootPath$([System.IO.Path]::DirectorySeparatorChar)" }

    if (($localPath -ne $rootPath) -and (-not $localPath.StartsWith($rootPrefix))) {
      $context.Response.StatusCode = 403
      $context.Response.Close()
      continue
    }

    if (-not [System.IO.File]::Exists($localPath)) {
      $context.Response.StatusCode = 404
      $context.Response.Close()
      continue
    }

    $bytes = [System.IO.File]::ReadAllBytes($localPath)
    $context.Response.ContentType = Get-ContentType $localPath
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.Headers.Add('Cache-Control', 'no-store')
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.Close()
  }
}
finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}
