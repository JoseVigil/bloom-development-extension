// Package core owns CLI infrastructure, not Monitor's observation domain.
package core

import "io"

var buildNumber = "0"
var BuildDate = "unknown"
var BuildTime = "unknown"

type Core struct {
	Out           io.Writer
	Err           io.Writer
	JSON          bool
	Logger        *Logger
	LoggerFactory func(bool) (*Logger, error)
}
