// Package core owns CLI infrastructure, not the portable evaluation engine.
package core

import (
	"impact/internal/evaluation"
	"io"
)

var buildNumber = "0"
var BuildDate = "unknown"
var BuildTime = "unknown"

type Core struct {
	Engine        *evaluation.Engine
	Out           io.Writer
	Err           io.Writer
	JSON          bool
	Logger        *Logger
	LoggerFactory func(bool) (*Logger, error)
}
