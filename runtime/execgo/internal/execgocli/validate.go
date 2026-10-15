package execgocli

import (
	"encoding/json"
	"fmt"

	"github.com/iammm0/execgo/pkg/adapter"
)

// ValidateAdapterActionBody validates an act/translate JSON body before it is sent to ExecGo.
func ValidateAdapterActionBody(body []byte) error {
	var req adapter.AgentActionRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}
	if err := adapter.NewAdapterKernel().ValidateActionRequest(req); err != nil {
		return err
	}
	return nil
}
