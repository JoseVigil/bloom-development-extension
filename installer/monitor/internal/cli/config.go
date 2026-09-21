package cli

type HelpConfig struct {
	AppName       string
	AppSubtitle   string
	CategoryOrder []string
	CategoryDescs map[string]string
}

func DefaultMonitorConfig() HelpConfig {
	return HelpConfig{AppName: "MONITOR", AppSubtitle: "Local persistent runtime observation for Cognituum", CategoryOrder: []string{"SYSTEM"}, CategoryDescs: map[string]string{"SYSTEM": "Command discovery, contracts and process status"}}
}
