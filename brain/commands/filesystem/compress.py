"""
Filesystem compression commands for Brain CLI.
Provides codebase/docbase compression and extraction functionality.
"""

import typer
from pathlib import Path
from typing import List, Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class CompressCommand(BaseCommand):
    """
    Compress files (codebase or docbase) into optimized JSON for AI consumption.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="compress",
            category=CommandCategory.FILESYSTEM,
            version="2.1.0",
            description="Compress files into optimized JSON for AI consumption",
            examples=[
                "brain filesystem compress ./src --mode codebase",
                "brain filesystem compress ./docs --mode docbase --output ./compressed",
                "brain filesystem compress ./src ./lib --mode codebase --exclude '*.test.py'",
                "brain filesystem compress ./src --mode codebase --no-comments --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """Register the compress command."""
        
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            paths: List[str] = typer.Argument(
                ...,
                help="Paths to compress (files or directories)"
            ),
            mode: str = typer.Option(
                "codebase",
                "--mode", "-m",
                help="Compression mode: 'codebase' or 'docbase'"
            ),
            output: Optional[str] = typer.Option(
                None,
                "--output", "-o",
                help="Output directory (default: current directory)"
            ),
            exclude: List[str] = typer.Option(
                [],
                "--exclude", "-e",
                help="Patterns to exclude (can be used multiple times)"
            ),
            no_comments: bool = typer.Option(
                False,
                "--no-comments",
                help="Remove comments during compression"
            )
        ):
            """Compress files into optimized JSON format for AI consumption."""
            
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            # 2. Validar mode
            if mode not in ["codebase", "docbase"]:
                self._handle_error(gc, f"Invalid mode: {mode}. Use 'codebase' or 'docbase'")
            
            try:
                # 3. Lazy Import del Core
                from brain.core.filesystem.files_compressor import FilesCompressor
                
                # 4. Verbose logging
                if gc.verbose:
                    typer.echo(f"🗜️  Compressing {len(paths)} path(s) in {mode} mode...", err=True)
                    if exclude:
                        typer.echo(f"📋 Excluding patterns: {', '.join(exclude)}", err=True)
                
                # 5. Ejecutar compresión
                compressor = FilesCompressor(
                    mode=mode,
                    preserve_comments=not no_comments
                )
                
                json_path, index_path = compressor.compress_paths(
                    input_paths=paths,
                    output_dir=output,
                    exclude_patterns=exclude if exclude else None
                )
                
                # 6. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "compress",
                    "data": {
                        "mode": mode,
                        "json_file": json_path,
                        "index_file": index_path,
                        "stats": {
                            "total_files": compressor.stats['total_files'],
                            "total_size_original": compressor.stats['total_size_original'],
                            "total_size_compressed": compressor.stats['total_size_compressed'],
                            "languages": compressor.stats['languages'],
                            "errors": compressor.stats['errors']
                        }
                    }
                }
                
                # 7. Output dual
                gc.output(result, self._render_compress_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"Path not found: {e}")
            except ValueError as e:
                self._handle_error(gc, f"Invalid input: {e}")
            except Exception as e:
                self._handle_error(gc, f"Compression failed: {e}")
    
    def _render_compress_success(self, data: dict):
        """Output humano para compresión exitosa."""
        operation_data = data['data']
        stats = operation_data['stats']
        
        typer.echo(f"✅ Compression completed ({operation_data['mode']} mode)")
        typer.echo(f"📄 Output: {operation_data['json_file']}")
        typer.echo(f"📊 Index: {operation_data['index_file']}")
        typer.echo(f"\n📈 Statistics:")
        typer.echo(f"   • Files processed: {stats['total_files']}")
        typer.echo(f"   • Original size: {self._format_bytes(stats['total_size_original'])}")
        typer.echo(f"   • Compressed size: {self._format_bytes(stats['total_size_compressed'])}")
        
        if stats['total_size_original'] > 0:
            ratio = (1 - stats['total_size_compressed'] / stats['total_size_original']) * 100
            typer.echo(f"   • Compression ratio: {ratio:.1f}%")
        
        if stats['languages']:
            typer.echo(f"\n🔤 Languages:")
            for lang, count in sorted(stats['languages'].items(), key=lambda x: x[1], reverse=True):
                typer.echo(f"   • {lang}: {count} file(s)")
        
        if stats['errors']:
            typer.echo(f"\n⚠️  Errors: {len(stats['errors'])}")
            for error in stats['errors'][:3]:  # Mostrar solo las primeras 3
                typer.echo(f"   • {error}")
    
    def _format_bytes(self, bytes_count: int) -> str:
        """Format bytes to human-readable string."""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if bytes_count < 1024.0:
                return f"{bytes_count:.2f} {unit}"
            bytes_count /= 1024.0
        return f"{bytes_count:.2f} TB"
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


class ExtractCommand(BaseCommand):
    """
    Extract files from compressed JSON format back to disk.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="extract",
            category=CommandCategory.FILESYSTEM,
            version="2.1.0",
            description="Extract files from compressed JSON format",
            examples=[
                "brain filesystem extract .codebase.json",
                "brain filesystem extract .codebase.json --output ./extracted",
                "brain filesystem extract .docbase.json --no-verify-hashes",
                "brain filesystem extract .codebase.json --output ./src --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """Register the extract command."""
        
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            json_file: str = typer.Argument(
                ...,
                help="Compressed JSON file to extract"
            ),
            output: Optional[str] = typer.Option(
                None,
                "--output", "-o",
                help="Output directory (default: extracted_<mode>)"
            ),
            verify_hashes: bool = typer.Option(
                True,
                "--verify-hashes/--no-verify-hashes",
                help="Verify MD5 hashes during extraction"
            )
        ):
            """Extract files from compressed JSON format."""
            
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Import del Core
                from brain.core.filesystem.files_extractor import FilesExtractor
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo(f"📂 Extracting files from {json_file}...", err=True)
                    if not verify_hashes:
                        typer.echo("⚠️  Hash verification disabled", err=True)
                
                # 4. Ejecutar extracción
                extractor = FilesExtractor(verify_hashes=verify_hashes)
                extractor.extract(
                    json_path=json_file,
                    output_dir=output
                )
                
                # 5. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "extract",
                    "data": {
                        "json_file": json_file,
                        "output_dir": output or f"extracted from {json_file}",
                        "stats": {
                            "extracted": extractor.stats['extracted'],
                            "errors": extractor.stats['errors'],
                            "hash_mismatches": extractor.stats['hash_mismatches']
                        }
                    }
                }
                
                # 6. Output dual
                gc.output(result, self._render_extract_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"File not found: {e}")
            except ValueError as e:
                self._handle_error(gc, f"Invalid JSON format: {e}")
            except Exception as e:
                self._handle_error(gc, f"Extraction failed: {e}")
    
    def _render_extract_success(self, data: dict):
        """Output humano para extracción exitosa."""
        operation_data = data['data']
        stats = operation_data['stats']
        
        typer.echo(f"✅ Extraction completed")
        typer.echo(f"📂 Output directory: {operation_data['output_dir']}")
        typer.echo(f"\n📈 Statistics:")
        typer.echo(f"   • Files extracted: {stats['extracted']}")
        
        if stats['hash_mismatches'] > 0:
            typer.echo(f"   ⚠️  Hash mismatches: {stats['hash_mismatches']}")
        
        if stats['errors'] > 0:
            typer.echo(f"   ❌ Errors: {stats['errors']}")
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)