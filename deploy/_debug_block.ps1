$path = 'e:\myproject\stunning-fast\deploy\docker-deploy.ps1'
$lines = Get-Content -Path $path -Encoding UTF8
# Lines 80-89 (1-indexed) = indices 79-88
$block = $lines[79..88] -join "`n"
Write-Host "=== ACTUAL BLOCK (LF-joined) ==="
Write-Host $block
Write-Host "=== END ==="
Write-Host ""
Write-Host "=== Char-by-char of line 81 (index 80) ==="
$l = $lines[80]
Write-Host "Length: $($l.Length)"
for ($i = 0; $i -lt $l.Length; $i++) {
    $c = $l[$i]
    $code = [int][char]$c
    Write-Host "${i}: '$c' (0x$('{0:X4}' -f $code))"
}
