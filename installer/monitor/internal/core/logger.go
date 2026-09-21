package core

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type LoggerOptions struct {
	LogsDir   string
	Console   io.Writer
	Errors    io.Writer
	Now       func() time.Time
	Registrar Registrar
}
type Logger struct {
	mu         sync.Mutex
	options    LoggerOptions
	file       *os.File
	day        string
	registered bool
	closed     bool
}

func NewLogger(o LoggerOptions) (*Logger, error) {
	if !filepath.IsAbs(o.LogsDir) || o.Registrar == nil {
		return nil, fmt.Errorf("absolute logs directory and registrar required")
	}
	if o.Now == nil {
		o.Now = time.Now
	}
	if o.Console == nil {
		o.Console = io.Discard
	}
	if o.Errors == nil {
		o.Errors = io.Discard
	}
	l := &Logger{options: o}
	if err := l.write("INFO", "logging session started"); err != nil {
		if l.file != nil {
			_ = l.file.Close()
		}
		return nil, err
	}
	return l, nil
}
func (l *Logger) rotate(now time.Time) error {
	day := now.UTC().Format("20060102")
	if l.file == nil || l.day != day {
		dir := filepath.Join(l.options.LogsDir, "monitor")
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
		f, err := os.OpenFile(filepath.Join(dir, "monitor_core_"+day+".log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
		if err != nil {
			return err
		}
		if l.file != nil {
			if err = l.file.Sync(); err != nil {
				_ = f.Close()
				return err
			}
			if err = l.file.Close(); err != nil {
				_ = f.Close()
				return err
			}
		}
		l.file = f
		l.day = day
		l.registered = false
	}
	return nil
}
func (l *Logger) write(level, message string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.closed {
		return fmt.Errorf("logger closed")
	}
	now := l.options.Now().UTC()
	if err := l.rotate(now); err != nil {
		fmt.Fprintln(l.options.Errors, "Monitor log rotation failed")
		return err
	}
	line := fmt.Sprintf("%s [%s] %s\n", now.Format("2006/01/02 15:04:05"), level, message)
	if _, err := io.WriteString(l.file, line); err != nil {
		fmt.Fprintln(l.options.Errors, "Monitor log write failed")
		return err
	}
	if err := l.file.Sync(); err != nil {
		return err
	}
	if _, err := io.WriteString(l.options.Console, line); err != nil {
		return err
	}
	if !l.registered {
		if err := l.options.Registrar.Register(l.file.Name()); err != nil {
			failure := fmt.Sprintf("%s [ERROR] telemetry registration failed\n", now.Format("2006/01/02 15:04:05"))
			_, _ = io.WriteString(l.file, failure)
			_ = l.file.Sync()
			_, _ = io.WriteString(l.options.Errors, failure)
			return err
		}
		l.registered = true
	}
	return nil
}

// Only controlled operational metadata should be logged; never raw requests.
func (l *Logger) Debug(message string) error   { return l.write("DEBUG", message) }
func (l *Logger) Info(message string) error    { return l.write("INFO", message) }
func (l *Logger) Warn(message string) error    { return l.write("WARNING", message) }
func (l *Logger) Error(message string) error   { return l.write("ERROR", message) }
func (l *Logger) Success(message string) error { return l.write("SUCCESS", message) }
func (l *Logger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.closed {
		return nil
	}
	l.closed = true
	if l.file == nil {
		return nil
	}
	syncErr := l.file.Sync()
	var registerErr error
	// A process closing yesterday's file must not reactivate it after another
	// process has already registered today's stream file.
	if l.options.Now().UTC().Format("20060102") == l.day {
		registerErr = l.options.Registrar.Register(l.file.Name())
	}
	closeErr := l.file.Close()
	if registerErr != nil {
		fmt.Fprintln(l.options.Errors, "Monitor telemetry update failed at close")
		return registerErr
	}
	if syncErr != nil {
		return syncErr
	}
	return closeErr
}
