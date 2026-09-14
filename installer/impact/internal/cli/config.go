package cli

type HelpConfig struct {
	AppName       string
	AppSubtitle   string
	CategoryOrder []string
	CategoryDescs map[string]string
}

func DefaultImpactConfig() HelpConfig {
	return HelpConfig{AppName: "IMPACT", AppSubtitle: "Portable consequence evaluation for Cognituum", CategoryOrder: []string{"SYSTEM", "EVALUATION"}, CategoryDescs: map[string]string{"SYSTEM": "Command discovery and contracts", "EVALUATION": "Explicit questions, evidence and consequences"}}
}
