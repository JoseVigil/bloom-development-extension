// File: internal/orchestration/activities/brain_poller.go
package activities

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"time"

	"nucleus/internal/core"
	"nucleus/internal/mandates"
)

const (
	brainPollerAddr       = "127.0.0.1:5678"
	brainPollerMinBackoff = 2 * time.Second
	brainPollerMaxBackoff = 60 * time.Second
)

type brainEvent struct {
	Type      string                 `json:"type"`
	ProfileID string                 `json:"profile_id,omitempty"`
	Data      map[string]interface{} `json:"data,omitempty"`
}

// BrainPollerConfig agrupa los paths que el poller necesita.
type BrainPollerConfig struct {
	LogsDir    string // e.g. C:\Users\...\BloomNucleus\logs
	NucleusBin string // path completo a nucleus.exe
}

// StartBrainPoller arranca el poll loop en la goroutine del llamador.
// Stream registrado: nucleus_brain_poller — logs/nucleus/nucleus_brain_poller_YYYYMMDD.log
func StartBrainPoller(ctx context.Context, cfg BrainPollerConfig) {
	// Construir core.Paths mínimo desde LogsDir para usar InitLogger
	paths := &core.Paths{LogsDir: cfg.LogsDir}

	// Categorías: nucleus (base) + synapse (alimenta flujo de lifecycle)
	logger, err := core.InitLogger(paths, "BRAIN_POLLER", false, "synapse")
	if err != nil {
		fmt.Printf("[brain_poller] [ERROR] failed to init logger: %v — continuing without file log\n", err)
		logger = nil
	}
	if logger != nil {
		defer logger.Close()
	}

	log := func(level, f string, v ...any) {
		msg := fmt.Sprintf(f, v...)
		if logger == nil {
			fmt.Printf("[brain_poller] [%s] %s\n", level, msg)
			return
		}
		switch level {
		case "INFO":
			logger.Info("%s", msg)
		case "WARN":
			logger.Warning("%s", msg)
		case "ERROR":
			logger.Error("%s", msg)
		case "SUCCESS":
			logger.Success("%s", msg)
		case "DEBUG":
			logger.Debug("%s", msg)
		}
	}

	log("INFO", "Brain poller started — target %s", brainPollerAddr)
	backoff := brainPollerMinBackoff

	for {
		select {
		case <-ctx.Done():
			log("INFO", "Brain poller stopping (context cancelled)")
			return
		default:
		}

		conn, err := dialBrain(ctx)
		if err != nil {
			log("WARN", "cannot connect to Brain: %v — retry in %s", err, backoff)
			select {
			case <-ctx.Done():
				log("INFO", "Brain poller stopping (context cancelled)")
				return
			case <-time.After(backoff):
			}
			backoff = minDuration(backoff*2, brainPollerMaxBackoff)
			continue
		}

		backoff = brainPollerMinBackoff
		log("INFO", "connected to Brain TCP at %s, sending REGISTER_CLI", brainPollerAddr)

		if err := registerCLI(conn); err != nil {
			log("WARN", "REGISTER_CLI failed: %v", err)
			conn.Close()
			continue
		}

		log("INFO", "registered as CLI — listening for broadcasts")
		pollLoop(ctx, conn, cfg, log)
		conn.Close()

		select {
		case <-ctx.Done():
			log("INFO", "Brain poller stopping (context cancelled)")
			return
		default:
			log("WARN", "Brain connection lost — reconnecting in %s", brainPollerMinBackoff)
		}
	}
}

func dialBrain(ctx context.Context) (net.Conn, error) {
	dialer := net.Dialer{Timeout: 5 * time.Second}
	return dialer.DialContext(ctx, "tcp", brainPollerAddr)
}

func registerCLI(conn net.Conn) error {
	return sendBrainEvent(conn, brainEvent{
		Type: "REGISTER_CLI",
		Data: map[string]interface{}{"source": "nucleus_brain_poller"},
	})
}

func sendBrainEvent(conn net.Conn, event brainEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	header := make([]byte, 4)
	binary.BigEndian.PutUint32(header, uint32(len(payload)))
	if _, err := conn.Write(header); err != nil {
		return fmt.Errorf("write header: %w", err)
	}
	if _, err := conn.Write(payload); err != nil {
		return fmt.Errorf("write payload: %w", err)
	}
	return nil
}

func readBrainEvent(conn net.Conn) (brainEvent, error) {
	header := make([]byte, 4)
	if _, err := io.ReadFull(conn, header); err != nil {
		return brainEvent{}, err
	}
	size := binary.BigEndian.Uint32(header)
	if size > 10*1024*1024 {
		return brainEvent{}, fmt.Errorf("payload too large: %d bytes", size)
	}
	buf := make([]byte, size)
	if _, err := io.ReadFull(conn, buf); err != nil {
		return brainEvent{}, err
	}
	var event brainEvent
	if err := json.Unmarshal(buf, &event); err != nil {
		return brainEvent{}, fmt.Errorf("unmarshal: %w", err)
	}
	return event, nil
}

type pollerLogFn func(level, f string, v ...any)

func pollLoop(ctx context.Context, conn net.Conn, cfg BrainPollerConfig, log pollerLogFn) {
	go func() {
		<-ctx.Done()
		conn.Close()
	}()

	for {
		event, err := readBrainEvent(conn)
		if err != nil {
			select {
			case <-ctx.Done():
				return
			default:
				if err != io.EOF {
					log("ERROR", "read error: %v", err)
				}
				return
			}
		}

		if event.Type != "PROFILE_DISCONNECTED" {
			log("DEBUG", "event received: type=%s profile_id=%s", event.Type, event.ProfileID)
			continue
		}

		profileID := event.ProfileID
		if profileID == "" && event.Data != nil {
			if pid, ok := event.Data["profile_id"].(string); ok {
				profileID = pid
			}
		}

		log("DEBUG", "event received: type=%s profile_id=%s", event.Type, profileID)

		if profileID == "" {
			log("WARN", "PROFILE_DISCONNECTED received without profile_id — skipping")
			continue
		}

		log("INFO", "PROFILE_DISCONNECTED → profile=%s — dispatching hooks", profileID[:min8(len(profileID))])

		hctx := mandates.NewHookContextWithPaths("", profileID, cfg.LogsDir, cfg.NucleusBin)
		go func(hc mandates.HookContext, logf pollerLogFn) {
			result := mandates.RunEvent(ctx, "profile_disconnected", hc)
			if result.Success {
				logf("SUCCESS", "hooks OK — total=%d profile=%s",
					result.Total, hc.ProfileID[:min8(len(hc.ProfileID))])
			} else {
				logf("ERROR", "hooks partial failure — total=%d failed=%d profile=%s",
					result.Total, result.Failed, hc.ProfileID[:min8(len(hc.ProfileID))])
				for _, hr := range result.Hooks {
					if !hr.Success {
						logf("ERROR", "  hook=%s error=%q stdout=%q stderr=%q",
							hr.Hook, hr.Error, hr.Stdout, hr.Stderr)
					}
				}
			}
		}(hctx, log)
	}
}

func minDuration(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}

func min8(n int) int {
	if n < 8 {
		return n
	}
	return 8
}