package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"
)

// LogHub agrega logs de múltiples fuentes
type LogHub struct {
	ctx     context.Context
	mu      sync.Mutex
	sources []string
	running bool
	paths   *PathResolver
}

// LogEntry representa una entrada de log unificada
type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Source    string `json:"source"`
	Level     string `json:"level"`
	Message   string `json:"message"`
}

// NewLogHub crea un nuevo agregador de logs
func NewLogHub(ctx context.Context, paths *PathResolver) *LogHub {
	return &LogHub{
		ctx: ctx,
		sources: []string{
			"synapse_native.log",
			"synapse_browser.log",
			"brain.log",
		},
		running: false,
		paths:   paths,
	}
}

// Start inicia el agregador de logs
func (lh *LogHub) Start() {
	lh.mu.Lock()
	if lh.running {
		lh.mu.Unlock()
		return
	}
	lh.running = true
	lh.mu.Unlock()

	log.Println("[LOG_HUB] Starting unified log aggregation...")

	var wg sync.WaitGroup

	for _, source := range lh.sources {
		wg.Add(1)
		go func(logFile string) {
			defer wg.Done()
			lh.tailLog(logFile)
		}(source)
	}

	wg.Wait()
	log.Println("[LOG_HUB] All log watchers stopped")
}

// Stop detiene el agregador
func (lh *LogHub) Stop() {
	lh.mu.Lock()
	lh.running = false
	lh.mu.Unlock()
	log.Println("[LOG_HUB] Stopping log aggregation...")
}

// tailLog hace un tail -f de un archivo de log con retry infinito
func (lh *LogHub) tailLog(logFile string) {
	// Resolver ruta completa usando PathResolver
	logPath := lh.paths.GetLogPath(logFile)

	log.Printf("[LOG_HUB] Waiting for %s...", logFile)

	// Retry infinito hasta que el archivo aparezca
	var file *os.File
	var err error
	
	for {
		select {
		case <-lh.ctx.Done():
			return
		default:
			file, err = os.Open(logPath)
			if err == nil {
				log.Printf("[LOG_HUB] ✓ Watching %s", logFile)
				break
			}
			// Archivo no existe aún, esperar y reintentar
			time.Sleep(2 * time.Second)
		}
		if file != nil {
			break
		}
	}
	
	defer file.Close()

	// Ir al final del archivo
	file.Seek(0, os.SEEK_END)

	reader := bufio.NewReader(file)

	for {
		select {
		case <-lh.ctx.Done():
			return
		default:
			line, err := reader.ReadString('\n')
			if err != nil {
				// Si no hay más datos, esperar un poco
				time.Sleep(100 * time.Millisecond)
				continue
			}

			// Enviar log unificado a stdout
			lh.emitLog(logFile, line)
		}
	}
}

// emitLog emite una entrada de log en formato JSON
func (lh *LogHub) emitLog(source, message string) {
	entry := LogEntry{
		Timestamp: time.Now().Format(time.RFC3339),
		Source:    source,
		Level:     lh.detectLevel(message),
		Message:   message,
	}

	// Enviar como JSON a stdout (Electron lo parsea)
	jsonData, _ := json.Marshal(entry)
	fmt.Fprintf(os.Stdout, "[LOG] %s\n", string(jsonData))
}

// detectLevel detecta el nivel de log del mensaje
func (lh *LogHub) detectLevel(message string) string {
	msgUpper := message
	// Lógica simple: buscar keywords
	if containsIgnoreCase(msgUpper, "ERROR") || containsIgnoreCase(msgUpper, "FATAL") {
		return "error"
	}
	if containsIgnoreCase(msgUpper, "WARN") || containsIgnoreCase(msgUpper, "WARNING") {
		return "warning"
	}
	if containsIgnoreCase(msgUpper, "INFO") {
		return "info"
	}
	return "debug"
}

// containsIgnoreCase verifica si una string contiene un substring (case-insensitive)
func containsIgnoreCase(s, substr string) bool {
	s = strings.ToLower(s)
	substr = strings.ToLower(substr)
	return strings.Contains(s, substr)
}