import os
from pathlib import Path

# Configuración del Entorno Sintético
TEST_ROOT = Path("_test_playground")

STRUCTURE = {
    "backend/rust_service": {
        "Cargo.toml": '[package]\nname = "rust-service"\nversion = "0.1.0"\n[dependencies]\nserde = "1.0"'
    },
    "backend/go_service": {
        "go.mod": 'module github.com/test/go-service\n\ngo 1.21\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.0\n)'
    },
    "backend/java_api": {
        "pom.xml": '<project><groupId>com.test</groupId><artifactId>java-api</artifactId><version>1.0</version></project>'
    },
    "frontend/react_app": {
        "package.json": '{"name": "react-app", "dependencies": {"react": "^18.0.0", "vite": "^4.0.0"}}',
        "vite.config.js": "export default {}"
    },
    "mobile/flutter_app": {
        "pubspec.yaml": 'name: flutter_app\ndescription: A new Flutter project.\ndependencies:\n  flutter:\n    sdk: flutter\n  http: ^0.13.0'
    },
    "mobile/ios_native": {
        "Podfile": "platform :ios, '14.0'\ntarget 'MyApp' do\n  pod 'Alamofire'\nend"
    },
    "infra/terraform": {
        "main.tf": 'provider "aws" {\n  region = "us-east-1"\n}'
    },
    "infra/docker": {
        "Dockerfile": "FROM python:3.9-slim\nWORKDIR /app",
        "docker-compose.yml": "version: '3'\nservices:\n  web:\n    build: ."
    },
    ".github/workflows": {
        "ci.yml": "name: CI\non: [push]"
    },
    "legacy/php_site": {
        "composer.json": '{"name": "test/php", "require": {"monolog/monolog": "^2.0"}}'
    }
}

def create_playground():
    if TEST_ROOT.exists():
        import shutil
        shutil.rmtree(TEST_ROOT)
    
    TEST_ROOT.mkdir()
    print(f"🏗️  Creando entorno de prueba en: {TEST_ROOT.resolve()}")

    for path_str, files in STRUCTURE.items():
        dir_path = TEST_ROOT / path_str
        dir_path.mkdir(parents=True, exist_ok=True)
        
        for filename, content in files.items():
            file_path = dir_path / filename
            file_path.write_text(content, encoding='utf-8')
            print(f"  + {path_str}/{filename}")

if __name__ == "__main__":
    create_playground()
    print("\n✅ Entorno listo. Ahora ejecuta:")
    print(f"   python -m core analyze --root {TEST_ROOT} --output {TEST_ROOT}/ANALYSIS_RESULT.md")