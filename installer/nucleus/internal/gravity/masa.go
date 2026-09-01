package gravity

// ComputeMasa is pure: it only evaluates fields already present in posture.
func ComputeMasa(posture GravityPosture) int {
	masa := 1
	switch posture.Origin {
	case OriginProject:
		masa = 2
	case OriginOrganization, OriginNucleus:
		masa = 3
	}
	if posture.Verifiable && masa < 3 {
		masa++
	}
	if posture.PromotedFrom != nil && masa < 3 {
		masa++
	}
	return masa
}
