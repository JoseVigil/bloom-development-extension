package core

import "strconv"

// Injected at build time via -ldflags "-X bloom-sensor/internal/core.buildNumber=..."
// Do not edit manually — values are set by build-component.sh on every build.
var buildNumber string = "0"
var BuildDate string = "unknown"
var BuildTime string = "unknown"

// BuildNumber exposes buildNumber as int for use across the package.
var BuildNumber int = func() int {
	n, _ := strconv.Atoi(buildNumber)
	return n
}()