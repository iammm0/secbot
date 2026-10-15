// Executor extension hooks and defaults / 执行器扩展点与默认实现。
// Author: iammm0; Last edited: 2026-04-23
package executor

import (
	"context"

	"github.com/iammm0/execgo/pkg/models"
)

// ExecutorExtension 允许自定义执行生命周期逻辑 / allows customizing the executor lifecycle hooks.
type ExecutorExtension interface {
	ExecuteMethod(ctx context.Context, task *models.Task) (*Result, error)
	BeforeExecute(ctx context.Context, task *models.Task) error
	AfterExecute(ctx context.Context, result *Result) error
	OnError(ctx context.Context, err error, task *models.Task) error
	Metadata() map[string]any
}

// NopExtension 默认扩展实现 / default no-op extension implementation.
type NopExtension struct{}

// ExecuteMethod 默认返回 nil / default implementation returns nil.
func (NopExtension) ExecuteMethod(ctx context.Context, task *models.Task) (*Result, error) {
	_ = ctx
	_ = task
	return nil, nil
}

// BeforeExecute 默认不做处理 / default no-op hook.
func (NopExtension) BeforeExecute(ctx context.Context, task *models.Task) error {
	_ = ctx
	_ = task
	return nil
}

// AfterExecute 默认不做处理 / default no-op hook.
func (NopExtension) AfterExecute(ctx context.Context, result *Result) error {
	_ = ctx
	_ = result
	return nil
}

// OnError 默认不做处理 / default no-op hook.
func (NopExtension) OnError(ctx context.Context, err error, task *models.Task) error {
	_ = ctx
	_ = err
	_ = task
	return nil
}

// Metadata 默认返回空 map / default returns an empty map.
func (NopExtension) Metadata() map[string]any { return map[string]any{} }
