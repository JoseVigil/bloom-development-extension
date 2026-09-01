#!/usr/bin/env bash

set -euo pipefail

antlr_jar="${1:-${ANTLR_JAR:-}}"

if [[ -z "$antlr_jar" || ! -f "$antlr_jar" ]]; then
    echo "ANTLR4 jar not found. Pass its path as the first argument or set ANTLR_JAR." >&2
    exit 1
fi
if ! command -v java >/dev/null 2>&1; then
    echo "Java is required to run the ANTLR4 generator." >&2
    exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
grammar="contracts/gravity/GravityExpression.g4"
go_output="$repo_root/installer/nucleus/internal/gravity"
ts_output="$repo_root/contracts/gravity/generated"

mkdir -p -- "$go_output" "$ts_output"

cd -- "$repo_root"
java -jar "$antlr_jar" -Xexact-output-dir -Dlanguage=Go -package gravity -visitor -no-listener -o "$go_output" "$grammar"
java -jar "$antlr_jar" -Xexact-output-dir -Dlanguage=TypeScript -visitor -no-listener -o "$ts_output" "$grammar"

# ANTLR emits interpreter/token metadata for its own tooling. Runtime consumers
# only need generated source, so keep those transient artifacts out of the repo.
metadata_files=(
    "GravityExpression.interp"
    "GravityExpression.tokens"
    "GravityExpressionLexer.interp"
    "GravityExpressionLexer.tokens"
)

for output in "$go_output" "$ts_output"; do
    for metadata in "${metadata_files[@]}"; do
        rm -f -- "$output/$metadata"
    done
done
