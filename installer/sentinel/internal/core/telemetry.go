package core

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type StreamInfo struct {
	Label      string `json:"label"`
	Path       string `json:"path"`
	Priority   int    `json:"priority"`
	FirstSeen  string `json:"first_seen"`
	LastUpdate string `json:"last_update"`
	Active     bool   `json:"active"`
}

type TelemetryData struct {
	Streams map[string]StreamInfo `json:"active_streams"`
}

type TelemetryManager struct {
	mu    sync.RWMutex
	data  TelemetryData
	path  string
	dirty bool
}

var (
	telemetryInstance *TelemetryManager
	once              sync.Once
)

func GetTelemetryManager(logsDir string) *TelemetryManager {
	once.Do(func() {
		telemetryInstance = &TelemetryManager{
			path: filepath.Join(logsDir, "telemetry.json"),
			data: TelemetryData{Streams: make(map[string]StreamInfo)},
		}
		telemetryInstance.load()
		go telemetryInstance.autoSaveLoop()
	})
	return telemetryInstance
}

func (tm *TelemetryManager) load() {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	if data, err := os.ReadFile(tm.path); err == nil {
		json.Unmarshal(data, &tm.data)
	}
	if tm.data.Streams == nil {
		tm.data.Streams = make(map[string]StreamInfo)
	}
}

func (tm *TelemetryManager) RegisterStream(id, label, path string, priority int) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	now := time.Now().Format(time.RFC3339)
	firstSeen := now
	if existing, exists := tm.data.Streams[id]; exists {
		firstSeen = existing.FirstSeen
	}

	tm.data.Streams[id] = StreamInfo{
		Label:      label,
		Path:       filepath.ToSlash(path),
		Priority:   priority,
		FirstSeen:  firstSeen,
		LastUpdate: now,
		Active:     true,
	}
	tm.dirty = true
}

func (tm *TelemetryManager) GetData() TelemetryData {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	copyStreams := make(map[string]StreamInfo)
	for k, v := range tm.data.Streams {
		copyStreams[k] = v
	}
	return TelemetryData{Streams: copyStreams}
}

func (tm *TelemetryManager) autoSaveLoop() {
	ticker := time.NewTicker(3 * time.Second)
	for range ticker.C {
		tm.save()
	}
}

func (tm *TelemetryManager) save() {
	tm.mu.Lock()
	if !tm.dirty {
		tm.mu.Unlock()
		return
	}
	data, _ := json.MarshalIndent(tm.data, "", "  ")
	tm.dirty = false
	tm.mu.Unlock()
	_ = os.WriteFile(tm.path, data, 0644)
}