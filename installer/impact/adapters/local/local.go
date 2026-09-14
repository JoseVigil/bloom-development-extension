package local

import (
	"bytes"
	"fmt"
	"impact/internal/contracts"
	"impact/internal/evaluation"
	"io"
)

const MaxRequestBytes = 1024 * 1024

func Evaluate(engine *evaluation.Engine, reader io.Reader) (contracts.Assessment, error) {
	raw, err := io.ReadAll(io.LimitReader(reader, MaxRequestBytes+1))
	if err != nil {
		return contracts.Assessment{}, fmt.Errorf("request read failed")
	}
	if len(raw) > MaxRequestBytes {
		return contracts.Assessment{}, fmt.Errorf("request exceeds size limit")
	}
	req, err := evaluation.Decode(bytes.NewReader(raw))
	if err != nil {
		return contracts.Assessment{}, err
	}
	return engine.Evaluate(req)
}
