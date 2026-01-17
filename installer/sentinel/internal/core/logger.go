package core

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"
)

type Logger struct {
	file   *os.File
	logger *log.Logger
}

func InitLogger(logsDir string) (*Logger, error) {
	now := time.Now()
	logFileName := fmt.Sprintf("sentinel_%s.log", now.Format("2006-01-02"))
	logFilePath := filepath.Join(logsDir, logFileName)

	file, err := os.OpenFile(logFilePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		return nil, fmt.Errorf("error al crear archivo de log: %w", err)
	}

	multiWriter := io.MultiWriter(os.Stdout, file)
	logger := log.New(multiWriter, "", log.Ldate|log.Ltime)

	return &Logger{
		file:   file,
		logger: logger,
	}, nil
}

func (l *Logger) Info(format string, v ...interface{}) {
	msg := fmt.Sprintf("[INFO] "+format, v...)
	l.logger.Println(msg)
}

func (l *Logger) Error(format string, v ...interface{}) {
	msg := fmt.Sprintf("[ERROR] "+format, v...)
	l.logger.Println(msg)
}

func (l *Logger) Warning(format string, v ...interface{}) {
	msg := fmt.Sprintf("[WARNING] "+format, v...)
	l.logger.Println(msg)
}

func (l *Logger) Success(format string, v ...interface{}) {
	msg := fmt.Sprintf("[SUCCESS] "+format, v...)
	l.logger.Println(msg)
}

func (l *Logger) Close() error {
	if l.file != nil {
		return l.file.Close()
	}
	return nil
}