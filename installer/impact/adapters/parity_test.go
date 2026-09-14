package adapters_test

import (
	"bytes"
	"encoding/json"
	"impact/adapters/local"
	"impact/adapters/server"
	"impact/internal/contracts"
	"impact/internal/evaluation"
	"net/http/httptest"
	"os"
	"reflect"
	"testing"
)

func TestSameFixtureSameAssessment(t *testing.T) {
	raw, e := os.ReadFile("../testdata/assessment.json")
	if e != nil {
		t.Fatal(e)
	}
	engine := evaluation.Default()
	a, e := local.Evaluate(engine, bytes.NewReader(raw))
	if e != nil {
		t.Fatal(e)
	}
	w := httptest.NewRecorder()
	server.Handler(engine).ServeHTTP(w, httptest.NewRequest("POST", "/", bytes.NewReader(raw)))
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var b contracts.Assessment
	if e = json.Unmarshal(w.Body.Bytes(), &b); e != nil || !reflect.DeepEqual(a, b) {
		t.Fatalf("parity failed: %v\n%+v\n%+v", e, a, b)
	}
}
func TestInvalidInputNeverBecomesAssessment(t *testing.T) {
	for _, raw := range []string{`{}`, `{} {}`, `{"unknown":true}`, string(bytes.Repeat([]byte(" "), local.MaxRequestBytes+1))} {
		w := httptest.NewRecorder()
		server.Handler(evaluation.Default()).ServeHTTP(w, httptest.NewRequest("POST", "/", bytes.NewBufferString(raw)))
		if w.Code != 400 {
			t.Fatal(w.Code)
		}
	}
	w := httptest.NewRecorder()
	server.Handler(evaluation.Default()).ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != 405 {
		t.Fatal(w.Code)
	}
}
