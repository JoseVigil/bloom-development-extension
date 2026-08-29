param(
    [string]$AntlrJar = $env:ANTLR_JAR
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AntlrJar) -or -not (Test-Path -LiteralPath $AntlrJar)) {
    throw "ANTLR4 jar not found. Pass -AntlrJar or set ANTLR_JAR."
}
if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    throw "Java is required to run the ANTLR4 generator."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$grammar = "contracts/gravity/GravityExpression.g4"
$goOutput = Join-Path $repoRoot "installer/nucleus/internal/gravity"
$tsOutput = Join-Path $repoRoot "contracts/gravity/generated"

New-Item -ItemType Directory -Force -Path $tsOutput | Out-Null

Push-Location $repoRoot
try {
    & java -jar $AntlrJar -Dlanguage=Go -package gravity -visitor -no-listener -o $goOutput $grammar
    if ($LASTEXITCODE -ne 0) { throw "ANTLR4 Go generation failed with exit code $LASTEXITCODE" }

    & java -jar $AntlrJar -Dlanguage=TypeScript -visitor -no-listener -o $tsOutput $grammar
    if ($LASTEXITCODE -ne 0) { throw "ANTLR4 TypeScript generation failed with exit code $LASTEXITCODE" }
}
finally {
    Pop-Location
}

# ANTLR emits interpreter/token metadata for its own tooling. Runtime consumers
# only need generated source, so keep those transient artifacts out of the repo.
foreach ($output in @($goOutput, $tsOutput)) {
    foreach ($metadata in @(
        "GravityExpression.interp",
        "GravityExpression.tokens",
        "GravityExpressionLexer.interp",
        "GravityExpressionLexer.tokens"
    )) {
        $metadataPath = Join-Path $output $metadata
        if (Test-Path -LiteralPath $metadataPath) {
            Remove-Item -LiteralPath $metadataPath -Force
        }
    }
}
