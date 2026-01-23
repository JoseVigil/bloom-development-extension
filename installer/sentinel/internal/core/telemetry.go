package core

type StreamInfo struct {
	Label      string `json:"label"`
	Path       string `json:"path"`
	Priority   int    `json:"priority"`
	LastUpdate string `json:"last_update"`
	Active     bool   `json:"active"`
}

type TelemetryData struct {
	Streams map[string]StreamInfo `json:"active_streams"`
}