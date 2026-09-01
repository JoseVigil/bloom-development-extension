package gravity

import "testing"

func TestComputeMasa(t *testing.T) {
	promotion := &PromotedFrom{FromPostureID: "r0", FromNodeID: "m0"}
	tests := []struct {
		name    string
		posture GravityPosture
		want    int
	}{
		{"session", GravityPosture{Origin: OriginSession}, 1},
		{"mandate evidence", GravityPosture{Origin: OriginMandateOwn, Verifiable: true}, 2},
		{"project promoted", GravityPosture{Origin: OriginProject, PromotedFrom: promotion}, 3},
		{"nucleus capped", GravityPosture{Origin: OriginNucleus, Verifiable: true, PromotedFrom: promotion}, 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ComputeMasa(tt.posture); got != tt.want {
				t.Fatalf("ComputeMasa()=%d want %d", got, tt.want)
			}
		})
	}
}
