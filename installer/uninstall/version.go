package main

import (
	_ "embed"
	"fmt"
	"strconv"
	"strings"
)

//go:embed VERSION
var productVersion string

// Injected by the Build project with -ldflags -X. A direct go build is
// explicitly identifiable as build 0 with unknown date and time.
var buildNumber = "0"
var BuildDate = "unknown"
var BuildTime = "unknown"

func versionLine() string {
	version := strings.TrimSpace(productVersion)
	n, err := strconv.Atoi(buildNumber)
	if err != nil || n < 0 {
		n = 0
	}
	return fmt.Sprintf("Bloom Uninstall v%s-build.%d (date %s, time %s)", version, n, BuildDate, BuildTime)
}
