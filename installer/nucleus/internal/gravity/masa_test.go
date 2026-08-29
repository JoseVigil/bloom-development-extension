package gravity

import "testing"

func TestComputeMasa(t *testing.T) {
	promotion := &PromotedFrom{FromRuleID: "r0", FromNodeID: "m0"}
	tests := []struct {
		name string
		rule GravityRule
		want int
	}{
		{"session", GravityRule{Origin: OriginSession}, 1},
		{"mandate evidence", GravityRule{Origin: OriginMandateOwn, Verifiable: true}, 2},
		{"project promoted", GravityRule{Origin: OriginProject, PromotedFrom: promotion}, 3},
		{"nucleus capped", GravityRule{Origin: OriginNucleus, Verifiable: true, PromotedFrom: promotion}, 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ComputeMasa(tt.rule); got != tt.want {
				t.Fatalf("ComputeMasa()=%d want %d", got, tt.want)
			}
		})
	}
}
