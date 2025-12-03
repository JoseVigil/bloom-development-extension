#!/usr/bin/env python3
"""
CLAUDE.AI BRIDGE AUTOMATION v1.0
Sistema de automatización bidireccional VSCode <-> Claude.ai
Compatible con cuentas gratuitas (sin API)

Arquitectura:
    VSCode Extension → Bridge (este script) → Claude.ai → Processor

Características:
    - Login automático con sesión persistente
    - Upload de contexto (archivos del proyecto)
    - Envío de prompts estandarizados
    - Scraping de respuestas (extrae preguntas)
    - Descarga automática de artifacts
    - Integración con processor existente

Uso desde VSCode:
    python claude_bridge.py --mode send --context project_context.json --prompt prompt.txt
    python claude_bridge.py --mode fetch --conversation-id abc123 --output snapshot.md
    python claude_bridge.py --mode parse-questions --conversation-id abc123
"""

import os
import sys
import json
import time
import argparse
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from playwright.sync_api import sync_playwright, Page, Browser, BrowserContext

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

class Config:
    """Configuración del bridge"""
    
    CLAUDE_URL = "https://claude.ai"
    CLAUDE_CHAT_URL = f"{CLAUDE_URL}/chat"
    
    # Directorios
    BASE_DIR = Path(__file__).parent
    DATA_DIR = BASE_DIR / "claude_bridge_data"
    SESSION_DIR = DATA_DIR / "sessions"
    ARTIFACTS_DIR = DATA_DIR / "artifacts"
    CONTEXT_DIR = DATA_DIR / "context"
    
    # Timeouts (segundos)
    NAVIGATION_TIMEOUT = 30000
    RESPONSE_TIMEOUT = 120000  # Claude puede tardar en generar
    ARTIFACT_WAIT = 5000
    
    # Selectores CSS (pueden cambiar con actualizaciones de Claude)
    SELECTORS = {
        'chat_input': 'div[contenteditable="true"]',
        'send_button': 'button[aria-label*="Send"]',
        'message_container': 'div[data-testid="message"]',
        'artifact_button': 'button:has-text("Open artifact")',
        'artifact_content': 'pre code, div[class*="artifact"]',
        'conversation_title': 'h1, div[class*="conversation-title"]'
    }
    
    @classmethod
    def setup_directories(cls):
        """Crear estructura de directorios"""
        for directory in [cls.DATA_DIR, cls.SESSION_DIR, 
                         cls.ARTIFACTS_DIR, cls.CONTEXT_DIR]:
            directory.mkdir(parents=True, exist_ok=True)


# ============================================================================
# SESSION MANAGER
# ============================================================================

class SessionManager:
    """Gestión de sesiones persistentes de Claude.ai"""
    
    def __init__(self, session_name: str = "default"):
        self.session_name = session_name
        self.session_file = Config.SESSION_DIR / f"{session_name}_session.json"
        self.context: Optional[BrowserContext] = None
    
    def save_session(self, context: BrowserContext):
        """Guardar cookies y storage"""
        cookies = context.cookies()
        storage = context.storage_state()
        
        session_data = {
            'cookies': cookies,
            'storage': storage,
            'timestamp': datetime.now().isoformat(),
            'session_name': self.session_name
        }
        
        with open(self.session_file, 'w') as f:
            json.dump(session_data, f, indent=2)
        
        print(f"✅ Sesión guardada: {self.session_file}")
    
    def load_session(self) -> Optional[Dict]:
        """Cargar sesión guardada"""
        if not self.session_file.exists():
            return None
        
        try:
            with open(self.session_file, 'r') as f:
                session_data = json.load(f)
            
            # Verificar antigüedad (sesiones válidas por 30 días)
            saved_time = datetime.fromisoformat(session_data['timestamp'])
            age_days = (datetime.now() - saved_time).days
            
            if age_days > 30:
                print(f"⚠️  Sesión expirada ({age_days} días)")
                return None
            
            print(f"✅ Sesión cargada: {age_days} días de antigüedad")
            return session_data
        
        except Exception as e:
            print(f"⚠️  Error cargando sesión: {e}")
            return None
    
    def requires_login(self, page: Page) -> bool:
        """Verificar si requiere login"""
        try:
            page.wait_for_url("**/chat/**", timeout=5000)
            return False
        except:
            return True


# ============================================================================
# CLAUDE CLIENT
# ============================================================================

class ClaudeClient:
    """Cliente automatizado para Claude.ai"""
    
    def __init__(self, headless: bool = True, session_name: str = "default"):
        self.headless = headless
        self.session_manager = SessionManager(session_name)
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
    
    def __enter__(self):
        """Context manager entry"""
        self.start()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()
    
    def start(self):
        """Iniciar navegador"""
        self.playwright = sync_playwright().start()
        
        # Configuración de navegador (simula usuario real)
        self.browser = self.playwright.chromium.launch(
            headless=self.headless,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox'
            ]
        )
        
        # Cargar sesión si existe
        session_data = self.session_manager.load_session()
        
        if session_data:
            self.context = self.browser.new_context(
                storage_state=session_data['storage'],
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            )
        else:
            self.context = self.browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            )
        
        self.page = self.context.new_page()
        
        # Anti-detección básica
        self.page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        """)
    
    def close(self):
        """Cerrar navegador"""
        if self.context:
            self.session_manager.save_session(self.context)
        
        if self.browser:
            self.browser.close()
        
        if self.playwright:
            self.playwright.stop()
    
    def login_if_needed(self):
        """Login manual si es necesario"""
        self.page.goto(Config.CLAUDE_URL, wait_until="networkidle")
        
        if self.session_manager.requires_login(self.page):
            print("\n🔐 LOGIN REQUERIDO")
            print("=" * 70)
            print("1. Iniciá sesión manualmente en el navegador")
            print("2. Una vez logueado, presioná ENTER aquí...")
            print("=" * 70)
            
            input("\nPresioná ENTER cuando hayas iniciado sesión: ")
            
            # Verificar login exitoso
            try:
                self.page.wait_for_url("**/chat/**", timeout=10000)
                print("✅ Login exitoso")
                self.session_manager.save_session(self.context)
            except:
                print("❌ Login falló o timeout")
                sys.exit(1)
    
    def send_message(self, message: str, context_files: Optional[List[str]] = None) -> str:
        """
        Enviar mensaje a Claude
        
        Args:
            message: Texto del mensaje/prompt
            context_files: Lista de rutas de archivos a adjuntar
        
        Returns:
            conversation_id: ID de la conversación
        """
        self.login_if_needed()
        
        # Navegar a nueva conversación
        self.page.goto(Config.CLAUDE_CHAT_URL, wait_until="networkidle")
        time.sleep(2)
        
        # Adjuntar archivos de contexto si existen
        if context_files:
            self._attach_files(context_files)
        
        # Encontrar input de chat
        chat_input = self.page.locator(Config.SELECTORS['chat_input']).first
        chat_input.click()
        
        # Escribir mensaje (simular tipeo humano)
        for char in message:
            chat_input.type(char, delay=20)
            if char in ['.', '!', '?', '\n']:
                time.sleep(100)
        
        # Enviar
        send_button = self.page.locator(Config.SELECTORS['send_button']).first
        send_button.click()
        
        print("📤 Mensaje enviado, esperando respuesta...")
        
        # Esperar respuesta completa
        self._wait_for_response()
        
        # Extraer conversation ID de la URL
        current_url = self.page.url
        conv_match = re.search(r'/chat/([a-f0-9-]+)', current_url)
        conversation_id = conv_match.group(1) if conv_match else "unknown"
        
        print(f"✅ Respuesta recibida | Conversation ID: {conversation_id}")
        
        return conversation_id
    
    def _attach_files(self, file_paths: List[str]):
        """Adjuntar archivos a la conversación"""
        # TODO: Implementar upload de archivos
        # Claude.ai permite arrastrar archivos, necesita interacción con file input
        print(f"⚠️  Adjuntar archivos aún no implementado: {len(file_paths)} archivos")
    
    def _wait_for_response(self):
        """Esperar a que Claude termine de responder"""
        try:
            # Esperar a que aparezca el último mensaje (de Claude)
            self.page.wait_for_selector(
                Config.SELECTORS['message_container'],
                timeout=Config.RESPONSE_TIMEOUT
            )
            
            # Esperar a que termine de "escribir" (indicator desaparece)
            time.sleep(3)
            
            # Verificar si hay "thinking" o "generating"
            for _ in range(60):  # 2 minutos máximo
                page_text = self.page.content()
                if 'thinking' not in page_text.lower() and \
                   'generating' not in page_text.lower():
                    break
                time.sleep(2)
            
        except Exception as e:
            print(f"⚠️  Timeout esperando respuesta: {e}")
    
    def extract_response(self, conversation_id: str) -> Dict:
        """
        Extraer respuesta completa de Claude
        
        Returns:
            {
                'text': str,
                'questions': List[str],
                'has_artifact': bool,
                'artifact_content': Optional[str]
            }
        """
        # Navegar a conversación específica
        conv_url = f"{Config.CLAUDE_CHAT_URL}/{conversation_id}"
        self.page.goto(conv_url, wait_until="networkidle")
        time.sleep(2)
        
        # Extraer todos los mensajes
        messages = self.page.locator(Config.SELECTORS['message_container']).all()
        
        if not messages:
            return {'text': '', 'questions': [], 'has_artifact': False}
        
        # Último mensaje es la respuesta de Claude
        last_message = messages[-1]
        response_text = last_message.inner_text()
        
        # Parsear preguntas (heurística)
        questions = self._parse_questions(response_text)
        
        # Verificar si hay artifact
        has_artifact = self._check_artifact()
        artifact_content = None
        
        if has_artifact:
            artifact_content = self._extract_artifact()
        
        return {
            'text': response_text,
            'questions': questions,
            'has_artifact': has_artifact,
            'artifact_content': artifact_content,
            'conversation_id': conversation_id
        }
    
    def _parse_questions(self, text: str) -> List[str]:
        """
        Extraer preguntas del texto usando heurísticas
        
        Patrones detectados:
        - Líneas que terminan en '?'
        - Secciones numeradas (1., 2., etc.) con preguntas
        - Checkboxes [ ] seguidas de pregunta
        """
        questions = []
        
        # Patrón 1: Líneas con '?'
        lines = text.split('\n')
        for line in lines:
            line = line.strip()
            if '?' in line:
                # Limpiar prefijos comunes
                cleaned = re.sub(r'^[\d\.\-\*\[\]]\s*', '', line)
                if cleaned and len(cleaned) > 10:
                    questions.append(cleaned)
        
        # Patrón 2: Secciones de "Preguntas"
        questions_section = re.search(
            r'(?:preguntas|questions)[:\s]+(.*?)(?:\n\n|$)',
            text,
            re.IGNORECASE | re.DOTALL
        )
        
        if questions_section:
            section_text = questions_section.group(1)
            for line in section_text.split('\n'):
                line = line.strip()
                if line and ('?' in line or line.startswith(('-', '*', '•'))):
                    cleaned = re.sub(r'^[\-\*\•\[\]]\s*', '', line)
                    if cleaned and len(cleaned) > 10:
                        questions.append(cleaned)
        
        # Deduplicar manteniendo orden
        seen = set()
        unique_questions = []
        for q in questions:
            if q not in seen:
                seen.add(q)
                unique_questions.append(q)
        
        return unique_questions
    
    def _check_artifact(self) -> bool:
        """Verificar si hay artifact en la respuesta"""
        try:
            artifact_elements = self.page.locator(Config.SELECTORS['artifact_button']).count()
            return artifact_elements > 0
        except:
            return False
    
    def _extract_artifact(self) -> Optional[str]:
        """Extraer contenido del artifact"""
        try:
            # Click en botón de artifact
            artifact_btn = self.page.locator(Config.SELECTORS['artifact_button']).first
            artifact_btn.click()
            
            time.sleep(2)
            
            # Extraer contenido
            content_element = self.page.locator(Config.SELECTORS['artifact_content']).first
            content = content_element.inner_text()
            
            return content
        
        except Exception as e:
            print(f"⚠️  Error extrayendo artifact: {e}")
            return None
    
    def download_artifact(self, conversation_id: str, output_path: str) -> bool:
        """
        Descargar artifact de una conversación
        
        Args:
            conversation_id: ID de la conversación
            output_path: Ruta donde guardar el artifact
        
        Returns:
            True si se descargó exitosamente
        """
        response = self.extract_response(conversation_id)
        
        if not response['has_artifact']:
            print("❌ No se encontró artifact en la conversación")
            return False
        
        artifact_content = response['artifact_content']
        
        if not artifact_content:
            print("❌ No se pudo extraer contenido del artifact")
            return False
        
        # Guardar artifact
        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(artifact_content)
        
        print(f"✅ Artifact guardado: {output_file}")
        print(f"   Tamaño: {len(artifact_content)} caracteres")
        
        return True


# ============================================================================
# CONTEXT BUILDER
# ============================================================================

class ContextBuilder:
    """Constructor de contexto del proyecto para enviar a Claude"""
    
    @staticmethod
    def build_from_files(file_paths: List[str]) -> str:
        """
        Construir contexto a partir de lista de archivos
        
        Formato:
            ### Archivo: ruta/archivo.ext
            ```language
            [contenido]
            ```
        """
        context_parts = []
        
        for file_path in file_paths:
            path = Path(file_path)
            
            if not path.exists():
                print(f"⚠️  Archivo no existe: {file_path}")
                continue
            
            # Leer contenido
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
            except:
                print(f"⚠️  Error leyendo: {file_path}")
                continue
            
            # Detectar lenguaje por extensión
            extension = path.suffix.lstrip('.')
            language_map = {
                'py': 'python', 'js': 'javascript', 'ts': 'typescript',
                'jsx': 'jsx', 'tsx': 'tsx', 'md': 'markdown',
                'json': 'json', 'yaml': 'yaml', 'yml': 'yaml'
            }
            language = language_map.get(extension, extension)
            
            # Construir bloque
            context_parts.append(f"### Archivo: {file_path}")
            context_parts.append(f"```{language}")
            context_parts.append(content)
            context_parts.append("```")
            context_parts.append("")  # Línea vacía
        
        return '\n'.join(context_parts)
    
    @staticmethod
    def build_from_directory(directory: str, extensions: List[str] = None) -> str:
        """Construir contexto de todos los archivos en un directorio"""
        dir_path = Path(directory)
        
        if not dir_path.exists():
            raise ValueError(f"Directorio no existe: {directory}")
        
        # Extensiones por defecto
        if extensions is None:
            extensions = ['.py', '.js', '.ts', '.jsx', '.tsx', '.md']
        
        # Buscar archivos
        file_paths = []
        for ext in extensions:
            file_paths.extend(dir_path.rglob(f"*{ext}"))
        
        # Convertir a strings
        file_paths_str = [str(p) for p in file_paths]
        
        return ContextBuilder.build_from_files(file_paths_str)


# ============================================================================
# CLI INTERFACE
# ============================================================================

def cmd_send(args):
    """Comando: Enviar prompt con contexto"""
    Config.setup_directories()
    
    # Leer prompt
    if args.prompt:
        with open(args.prompt, 'r', encoding='utf-8') as f:
            prompt_text = f.read()
    else:
        prompt_text = args.message
    
    # Construir contexto si se especificó
    context_files = []
    if args.context:
        with open(args.context, 'r', encoding='utf-8') as f:
            context_config = json.load(f)
            context_files = context_config.get('files', [])
    
    # Ejecutar
    with ClaudeClient(headless=args.headless) as client:
        conversation_id = client.send_message(prompt_text, context_files)
        
        # Guardar ID de conversación
        output = {
            'conversation_id': conversation_id,
            'timestamp': datetime.now().isoformat(),
            'prompt': prompt_text[:200] + '...'
        }
        
        output_file = Config.DATA_DIR / f"conversation_{conversation_id}.json"
        with open(output_file, 'w') as f:
            json.dump(output, f, indent=2)
        
        print(f"\n✅ Conversación guardada: {output_file}")


def cmd_fetch(args):
    """Comando: Descargar artifact de conversación"""
    Config.setup_directories()
    
    with ClaudeClient(headless=args.headless) as client:
        success = client.download_artifact(
            args.conversation_id,
            args.output
        )
        
        if success:
            print(f"\n✅ Artifact listo para procesar")
            print(f"   python process_snapshot.py {args.output} {args.project_root}")
        else:
            sys.exit(1)


def cmd_parse_questions(args):
    """Comando: Extraer preguntas de respuesta"""
    Config.setup_directories()
    
    with ClaudeClient(headless=args.headless) as client:
        response = client.extract_response(args.conversation_id)
        
        print(f"\n📋 RESPUESTA EXTRAÍDA")
        print("=" * 70)
        print(f"Texto completo: {len(response['text'])} caracteres")
        print(f"Preguntas detectadas: {len(response['questions'])}")
        print(f"Tiene artifact: {response['has_artifact']}")
        print("=" * 70)
        
        if response['questions']:
            print("\n❓ PREGUNTAS DETECTADAS:")
            for i, q in enumerate(response['questions'], 1):
                print(f"\n{i}. {q}")
        
        # Guardar en archivo
        output_file = Config.DATA_DIR / f"questions_{args.conversation_id}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(response, f, indent=2, ensure_ascii=False)
        
        print(f"\n✅ Guardado en: {output_file}")


def main():
    parser = argparse.ArgumentParser(
        description='Claude Bridge Automation - VSCode Integration'
    )
    
    parser.add_argument('--headless', action='store_true',
                       help='Ejecutar navegador en modo headless')
    
    subparsers = parser.add_subparsers(dest='command', help='Comandos disponibles')
    
    # Comando: send
    send_parser = subparsers.add_parser('send', help='Enviar prompt a Claude')
    send_parser.add_argument('--prompt', help='Archivo con el prompt')
    send_parser.add_argument('--message', help='Mensaje directo')
    send_parser.add_argument('--context', help='Archivo JSON con contexto del proyecto')
    
    # Comando: fetch
    fetch_parser = subparsers.add_parser('fetch', help='Descargar artifact')
    fetch_parser.add_argument('conversation_id', help='ID de la conversación')
    fetch_parser.add_argument('--output', required=True, help='Archivo de salida')
    fetch_parser.add_argument('--project-root', help='Raíz del proyecto (para procesar)')
    
    # Comando: parse-questions
    questions_parser = subparsers.add_parser('parse-questions',
                                             help='Extraer preguntas de respuesta')
    questions_parser.add_argument('conversation_id', help='ID de la conversación')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    # Ejecutar comando
    if args.command == 'send':
        cmd_send(args)
    elif args.command == 'fetch':
        cmd_fetch(args)
    elif args.command == 'parse-questions':
        cmd_parse_questions(args)


if __name__ == "__main__":
    main()