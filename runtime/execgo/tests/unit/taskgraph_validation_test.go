// Task graph validation unit tests / 任务图校验单元测试。
// Author: iammm0; Last edited: 2026-04-23
package unit_test

import (
	"testing"

	"github.com/iammm0/execgo/pkg/models"
)

// TestTaskGraphValidate verifies TaskGraph.Validate behavior / 验证 TaskGraph.Validate 行为。
func TestTaskGraphValidate(t *testing.T) {
	tests := []struct {
		name    string
		graph   models.TaskGraph
		wantErr bool
	}{
		{
			name:    "empty graph",
			graph:   models.TaskGraph{},
			wantErr: true,
		},
		{
			name: "duplicate id",
			graph: models.TaskGraph{Tasks: []*models.Task{
				{ID: "a", Type: "noop"},
				{ID: "a", Type: "noop"},
			}},
			wantErr: true,
		},
		{
			name: "unknown dependency",
			graph: models.TaskGraph{Tasks: []*models.Task{
				{ID: "a", Type: "noop", DependsOn: []string{"x"}},
			}},
			wantErr: true,
		},
		{
			name: "self dependency",
			graph: models.TaskGraph{Tasks: []*models.Task{
				{ID: "a", Type: "noop", DependsOn: []string{"a"}},
			}},
			wantErr: true,
		},
		{
			name: "cycle",
			graph: models.TaskGraph{Tasks: []*models.Task{
				{ID: "a", Type: "noop", DependsOn: []string{"b"}},
				{ID: "b", Type: "noop", DependsOn: []string{"a"}},
			}},
			wantErr: true,
		},
		{
			name: "valid dag",
			graph: models.TaskGraph{Tasks: []*models.Task{
				{ID: "a", Type: "noop"},
				{ID: "b", Type: "noop", DependsOn: []string{"a"}},
			}},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.graph.Validate()
			if (err != nil) != tt.wantErr {
				t.Fatalf("Validate() error=%v wantErr=%v", err, tt.wantErr)
			}
		})
	}
}
