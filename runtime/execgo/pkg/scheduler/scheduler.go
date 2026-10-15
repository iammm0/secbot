// Package scheduler 实现基于 DAG 的任务调度器
// implements a DAG-based task scheduler.
// Author: iammm0; Last edited: 2026-04-23
package scheduler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/iammm0/execgo/pkg/executor"
	"github.com/iammm0/execgo/pkg/models"
	"github.com/iammm0/execgo/pkg/observability"
	"github.com/iammm0/execgo/pkg/store"
)

// Scheduler DAG 任务调度器 / DAG task scheduler.
type Scheduler struct {
	state   store.Store
	metrics *observability.Metrics
	logger  *slog.Logger

	readyQueue chan *models.Task   // 就绪队列 / ready queue
	semaphore  chan struct{}       // 并发信号量 / concurrency semaphore
	depCount   map[string]int      // 剩余依赖计数 / remaining dependency count
	dependents map[string][]string // 反向依赖图 / reverse dependency graph
	inFlight   map[string]*inFlightTask
	mu         sync.Mutex // 保护 depCount 和 dependents / protects depCount & dependents

	wg     sync.WaitGroup
	cancel context.CancelFunc
}

const asyncHandlePollInterval = 100 * time.Millisecond

type inFlightTask struct {
	cancel       context.CancelFunc
	exec         executor.Executor
	handle       string
	started      time.Time
	cancelResult *executor.Result
}

// New 创建调度器 / creates a new scheduler.
func New(st store.Store, metrics *observability.Metrics, logger *slog.Logger, maxConcurrency int) *Scheduler {
	return &Scheduler{
		state:      st,
		metrics:    metrics,
		logger:     logger,
		readyQueue: make(chan *models.Task, 1024),
		semaphore:  make(chan struct{}, maxConcurrency),
		depCount:   make(map[string]int),
		dependents: make(map[string][]string),
		inFlight:   make(map[string]*inFlightTask),
	}
}

// Start 启动调度器工作循环 / starts the scheduler work loop.
func (s *Scheduler) Start(ctx context.Context) {
	ctx, s.cancel = context.WithCancel(ctx)

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.loop(ctx)
	}()

	s.logger.Info("scheduler started")
}

// Stop 优雅关闭调度器 / gracefully stops the scheduler.
func (s *Scheduler) Stop() {
	if s.cancel != nil {
		s.cancel()
	}
	s.wg.Wait()
	s.logger.Info("scheduler stopped")
}

// Submit 提交任务图到调度器 / submits a task graph to the scheduler.
func (s *Scheduler) Submit(graph *models.TaskGraph) {
	now := time.Now()

	s.mu.Lock()
	defer s.mu.Unlock()

	for _, task := range graph.Tasks {
		task.Status = models.StatusPending
		task.CreatedAt = now
		task.UpdatedAt = now
		s.state.Put(task)
		s.metrics.TasksTotal.Add(1)
		s.metrics.IncType(task.Type)

		// 构建依赖计数与反向依赖图 / build dependency count and reverse graph
		s.depCount[task.ID] = len(task.DependsOn)
		for _, dep := range task.DependsOn {
			s.dependents[dep] = append(s.dependents[dep], task.ID)
		}
	}

	// 将无依赖的任务加入就绪队列 / enqueue tasks with no dependencies
	for _, task := range graph.Tasks {
		if s.depCount[task.ID] == 0 {
			s.enqueue(task)
		}
	}
}

// enqueue 将任务放入就绪队列 / puts a task into the ready queue.
func (s *Scheduler) enqueue(task *models.Task) {
	select {
	case s.readyQueue <- task:
	default:
		s.logger.Warn("ready queue full, task will wait", "task_id", task.ID)
		go func() { s.readyQueue <- task }()
	}
}

// loop 调度主循环 / main scheduling loop.
func (s *Scheduler) loop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case task := <-s.readyQueue:
			s.semaphore <- struct{}{} // 获取并发槽 / acquire concurrency slot
			s.wg.Add(1)
			go func(t *models.Task) {
				defer s.wg.Done()
				defer func() { <-s.semaphore }() // 释放并发槽 / release concurrency slot
				s.executeTask(ctx, t)
			}(task)
		}
	}
}

// executeTask 执行单个任务，含超时和重试 / executes a single task with timeout and retry.
func (s *Scheduler) executeTask(ctx context.Context, task *models.Task) {
	if taskStatusIsTerminal(task.Status) {
		return
	}
	logger := s.logger.With("task_id", task.ID, "task_type", task.Type)
	executor.NormalizeTask(task)

	// 获取执行器 / get executor
	exec, err := executor.Get(task.Type)
	if err != nil {
		logger.Error("executor not found", "error", err)
		s.completeTask(task, models.StatusFailed, nil, err, nil, time.Time{}, time.Now(), 0)
		return
	}

	// 更新状态为 running / mark as running
	runStartedAt := time.Now()
	task.RunStatus = string(models.RuntimeRunning)
	task.Runtime = &models.RuntimeResult{
		Status:    models.RuntimeRunning,
		StartedAt: timePtr(runStartedAt),
	}
	s.state.UpdateStatus(task.ID, models.StatusRunning, nil, "")
	s.metrics.TasksRunning.Add(1)
	logger.Info("task started")

	maxAttempts := task.Retry + 1
	if maxAttempts < 1 {
		maxAttempts = 1
	}

	var lastErr error
	var execResult *executor.Result
	attemptsUsed := 0

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		attemptsUsed = attempt
		if attempt > 1 {
			// 指数退避: 100ms * 2^(attempt-2) / exponential backoff
			backoff := time.Duration(100*(1<<(attempt-2))) * time.Millisecond
			if backoff > 10*time.Second {
				backoff = 10 * time.Second
			}
			logger.Info("retrying task", "attempt", attempt, "backoff", backoff)
			time.Sleep(backoff)
		}

		// 构建带超时的 context / build context with timeout
		execCtx := ctx
		var cancelFn context.CancelFunc
		if task.Timeout > 0 {
			execCtx, cancelFn = context.WithTimeout(ctx, time.Duration(task.Timeout)*time.Millisecond)
		} else {
			execCtx, cancelFn = context.WithCancel(ctx)
		}
		s.setInFlight(task.ID, &inFlightTask{
			cancel:  cancelFn,
			exec:    exec,
			started: runStartedAt,
		})

		execResult, lastErr = exec.Execute(execCtx, task)
		if execResult != nil && execResult.Attempt == 0 {
			execResult.Attempt = attempt
		}
		if execResult != nil {
			s.applyInFlightRuntime(task, execResult, runStartedAt, attempt)
		}
		if lastErr == nil && execResult != nil && !execResult.Status.IsTerminal() {
			execResult, lastErr = s.awaitRuntimeResult(execCtx, exec, execResult, logger, runStartedAt, attempt, task)
		}
		if errors.Is(lastErr, context.Canceled) {
			if res := s.inFlightCancelResult(task.ID); res != nil {
				if res.Attempt == 0 {
					res.Attempt = attempt
				}
				execResult = res
				lastErr = runtimeResultError(res)
			}
		}
		cancelFn()
		s.clearInFlight(task.ID)

		if lastErr == nil {
			break
		}
		if errors.Is(lastErr, context.Canceled) {
			break
		}
		logger.Warn("task attempt failed", "attempt", attempt, "error", lastErr)
	}

	s.metrics.TasksRunning.Add(-1)
	finishedAt := time.Now()

	if lastErr != nil {
		logger.Error("task failed after all retries", "error", lastErr)
		status := models.StatusFailed
		if errors.Is(lastErr, context.Canceled) {
			status = models.StatusCancelled
		}
		s.completeTask(task, status, resultOutput(execResult), lastErr, execResult, runStartedAt, finishedAt, attemptsUsed)
	} else {
		logger.Info("task completed successfully")
		s.completeTask(task, models.StatusSuccess, resultOutput(execResult), nil, execResult, runStartedAt, finishedAt, attemptsUsed)
	}
}

// Cancel 请求取消一个 pending/running 任务 / requests cancellation for a pending or running task.
func (s *Scheduler) Cancel(taskID string) (*executor.Result, bool, error) {
	task, ok := s.state.Get(taskID)
	if !ok {
		return nil, false, fmt.Errorf("task not found: %s", taskID)
	}
	if taskStatusIsTerminal(task.Status) {
		return nil, true, nil
	}

	entry := s.inFlightEntry(taskID)
	if entry == nil {
		err := context.Canceled
		finishedAt := time.Now()
		res := &executor.Result{
			TaskID:   task.ID,
			HandleID: task.HandleID,
			Status:   models.RuntimeCancelled,
			Error: &models.RuntimeError{
				Code:    models.ErrorCancelled,
				Message: "task cancelled before execution",
				Source:  "scheduler",
			},
		}
		s.appendTaskEvent(task, models.RuntimeEvent{
			Type:      models.RuntimeEventCancelled,
			TaskID:    task.ID,
			HandleID:  task.HandleID,
			Timestamp: finishedAt,
			Message:   "task cancelled before execution",
		})
		s.completeTask(task, models.StatusCancelled, nil, err, res, time.Time{}, finishedAt, 0)
		return res, true, nil
	}

	handle := entry.handle
	if handle == "" {
		handle = task.HandleID
	}
	if handle == "" && task.Runtime != nil {
		handle = task.Runtime.HandleID
	}

	var cancelResult *executor.Result
	if canceler, ok := entry.exec.(executor.HandleCanceler); ok && handle != "" {
		if res, found := canceler.CancelHandle(handle); found {
			cancelResult = res
		}
	}
	if cancelResult == nil {
		cancelResult = &executor.Result{
			TaskID:   task.ID,
			HandleID: handle,
			Status:   models.RuntimeCancelled,
			Error: &models.RuntimeError{
				Code:    models.ErrorCancelled,
				Message: "task cancelled",
				Source:  "scheduler",
			},
		}
	}
	s.setInFlightCancelResult(taskID, cancelResult)
	if entry.cancel != nil {
		entry.cancel()
	}
	if cancelResult.Attempt == 0 && task.Runtime != nil {
		cancelResult.Attempt = task.Runtime.Attempt
	}
	now := time.Now()
	cancelEvent := models.RuntimeEvent{
		Type:      models.RuntimeEventCancelRequested,
		TaskID:    task.ID,
		HandleID:  handle,
		Timestamp: now,
		Message:   "task cancellation requested",
		Data: map[string]any{
			"source":       "scheduler",
			"runtime_kind": entry.exec.Name(),
		},
	}
	s.appendTaskEvent(task, cancelEvent)
	task.HandleID = handle
	task.Runtime = buildRuntimeResult(models.StatusCancelling, cancelResult, nil, entry.started, time.Time{}, cancelResult.Attempt)
	task.Runtime.Status = models.RuntimeCancelling
	task.RunStatus = string(models.RuntimeCancelling)
	errMsg := "task cancellation requested"
	if task.Runtime != nil && task.Runtime.Error != nil && task.Runtime.Error.Message != "" {
		errMsg = task.Runtime.Error.Message
	}
	s.state.UpdateStatus(task.ID, models.StatusCancelling, resultOutput(cancelResult), errMsg)
	return cancelResult, true, nil
}

// completeTask 完成任务并级联触发下游依赖 / completes a task and cascades to downstream dependents.
func (s *Scheduler) completeTask(task *models.Task, status models.TaskStatus, result json.RawMessage, runErr error, execResult *executor.Result, startedAt, finishedAt time.Time, attempt int) {
	runtime := buildRuntimeResult(status, execResult, runErr, startedAt, finishedAt, attempt)
	errMsg := ""
	if runtime != nil {
		task.Runtime = runtime
		task.RunStatus = string(runtime.Status)
		task.HandleID = runtime.HandleID
		if runtime.Error != nil {
			errMsg = runtime.Error.Message
		}
	}
	if execResult != nil {
		if len(execResult.Progress) > 0 {
			progress, _ := json.Marshal(execResult.Progress)
			task.Progress = progress
		}
	}
	s.appendTaskEvent(task, terminalTaskEvent(task, status, runtime, finishedAt))
	s.state.UpdateStatus(task.ID, status, result, errMsg)

	switch status {
	case models.StatusSuccess:
		s.metrics.TasksSucceeded.Add(1)
	case models.StatusCancelled:
		s.metrics.TasksCancelled.Add(1)
	default:
		s.metrics.TasksFailed.Add(1)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	children := s.dependents[task.ID]
	for _, childID := range children {
		if status == models.StatusFailed || status == models.StatusCancelled {
			reason := "failed"
			if status == models.StatusCancelled {
				reason = "cancelled"
			}
			// 依赖失败或取消 → 跳过下游 / dependency failed or cancelled -> skip downstream
			if child, ok := s.state.Get(childID); ok {
				child.Runtime = nil
				child.RunStatus = ""
			}
			s.state.UpdateStatus(childID, models.StatusSkipped, nil, "dependency "+task.ID+" "+reason)
			s.metrics.TasksFailed.Add(1)
			s.cascadeSkip(childID)
			continue
		}

		s.depCount[childID]--
		if s.depCount[childID] <= 0 {
			if child, ok := s.state.Get(childID); ok {
				s.enqueue(child)
			}
		}
	}
}

func resultOutput(r *executor.Result) json.RawMessage {
	if r == nil {
		return nil
	}
	return r.Output
}

// cascadeSkip 级联跳过所有下游依赖 / cascades skip to all downstream dependents.
func (s *Scheduler) cascadeSkip(taskID string) {
	if task, ok := s.state.Get(taskID); ok {
		task.Runtime = nil
		task.RunStatus = ""
	}
	for _, childID := range s.dependents[taskID] {
		s.state.UpdateStatus(childID, models.StatusSkipped, nil, "dependency "+taskID+" skipped")
		s.cascadeSkip(childID)
	}
}

func buildRuntimeResult(status models.TaskStatus, execResult *executor.Result, runErr error, startedAt, finishedAt time.Time, attempt int) *models.RuntimeResult {
	if execResult == nil && runErr == nil {
		return nil
	}

	runtime := &models.RuntimeResult{
		Status: runtimeStatusFromTask(status, runErr),
	}
	if execResult != nil {
		if execResult.Status != "" {
			runtime.Status = execResult.Status
		}
		runtime.HandleID = execResult.HandleID
		runtime.Attempt = execResult.Attempt
		runtime.DurationMS = execResult.DurationMS
		runtime.Output = cloneRaw(execResult.Output)
		runtime.Details = cloneRaw(execResult.Details)
		runtime.Error = cloneRuntimeError(execResult.Error)
		runtime.StartedAt = cloneTime(execResult.StartedAt)
		runtime.FinishedAt = cloneTime(execResult.FinishedAt)
	}
	if runtime.Attempt == 0 {
		runtime.Attempt = attempt
	}
	if runtime.StartedAt == nil && !startedAt.IsZero() {
		runtime.StartedAt = timePtr(startedAt)
	}
	if runtime.Status.IsTerminal() && runtime.FinishedAt == nil && !finishedAt.IsZero() {
		runtime.FinishedAt = timePtr(finishedAt)
	}
	if runtime.DurationMS == 0 && runtime.StartedAt != nil && runtime.FinishedAt != nil {
		runtime.DurationMS = runtime.FinishedAt.Sub(*runtime.StartedAt).Milliseconds()
	}
	if runtime.Error == nil && runErr != nil {
		runtime.Error = normalizeRuntimeError(runErr)
	}
	return runtime
}

func runtimeStatusFromTask(status models.TaskStatus, runErr error) models.RuntimeStatus {
	switch status {
	case models.StatusSuccess:
		return models.RuntimeSuccess
	case models.StatusRunning:
		return models.RuntimeRunning
	case models.StatusCancelling:
		return models.RuntimeCancelling
	case models.StatusCancelled:
		return models.RuntimeCancelled
	case models.StatusFailed:
		if errors.Is(runErr, context.Canceled) {
			return models.RuntimeCancelled
		}
		return models.RuntimeFailed
	default:
		return models.RuntimeFailed
	}
}

func normalizeRuntimeError(err error) *models.RuntimeError {
	if err == nil {
		return nil
	}
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return &models.RuntimeError{
			Code:      models.ErrorTimeout,
			Message:   err.Error(),
			Retryable: true,
			Source:    "scheduler",
		}
	case errors.Is(err, context.Canceled):
		return &models.RuntimeError{
			Code:    models.ErrorCancelled,
			Message: err.Error(),
			Source:  "scheduler",
		}
	default:
		return &models.RuntimeError{
			Code:    models.ErrorExternalFailure,
			Message: err.Error(),
			Source:  "executor",
		}
	}
}

func cloneRaw(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return nil
	}
	cp := make(json.RawMessage, len(raw))
	copy(cp, raw)
	return cp
}

func cloneRuntimeError(err *models.RuntimeError) *models.RuntimeError {
	if err == nil {
		return nil
	}
	cp := *err
	return &cp
}

func cloneTime(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	cp := *t
	return &cp
}

func timePtr(t time.Time) *time.Time {
	return &t
}

func (s *Scheduler) awaitRuntimeResult(
	ctx context.Context,
	exec executor.Executor,
	initial *executor.Result,
	logger *slog.Logger,
	startedAt time.Time,
	attempt int,
	task *models.Task,
) (*executor.Result, error) {
	if initial == nil {
		return nil, fmt.Errorf("async runtime wait requires initial result")
	}
	if initial.HandleID == "" {
		return initial, fmt.Errorf("non-terminal runtime result missing handle_id")
	}

	reader, ok := exec.(executor.HandleReader)
	if !ok {
		return initial, fmt.Errorf("executor %q returned non-terminal status %q without handle polling support", exec.Name(), initial.Status)
	}

	ticker := time.NewTicker(asyncHandlePollInterval)
	defer ticker.Stop()

	current := initial
	for {
		if current != nil {
			s.applyInFlightRuntime(task, current, startedAt, attempt)
			if current.Status.IsTerminal() {
				return current, runtimeResultError(current)
			}
		}

		select {
		case <-ctx.Done():
			logger.Warn("async task wait interrupted", "handle_id", initial.HandleID, "error", ctx.Err())
			return current, ctx.Err()
		case <-ticker.C:
			next, found := reader.GetHandle(initial.HandleID)
			if !found {
				logger.Warn("async handle not found during polling", "handle_id", initial.HandleID)
				return current, fmt.Errorf("handle not found: %s", initial.HandleID)
			}
			if next.Attempt == 0 {
				next.Attempt = attempt
			}
			current = next
		}
	}
}

func runtimeResultError(res *executor.Result) error {
	if res == nil {
		return nil
	}
	switch res.Status {
	case models.RuntimeSuccess:
		return nil
	case models.RuntimeCancelled:
		if res.Error != nil && res.Error.Message != "" {
			return canceledError{message: res.Error.Message}
		}
		return canceledError{message: "task cancelled"}
	case models.RuntimeFailed:
		if res.Error != nil && res.Error.Message != "" {
			return errors.New(res.Error.Message)
		}
		return errors.New("task failed")
	default:
		return nil
	}
}

func (s *Scheduler) applyInFlightRuntime(task *models.Task, execResult *executor.Result, startedAt time.Time, attempt int) {
	if execResult == nil {
		return
	}
	runtime := buildRuntimeResult(models.StatusRunning, execResult, nil, startedAt, time.Time{}, attempt)
	if runtime == nil {
		return
	}
	task.Runtime = runtime
	task.RunStatus = string(runtime.Status)
	task.HandleID = runtime.HandleID
	s.updateInFlightHandle(task.ID, runtime.HandleID)
	if len(execResult.Progress) > 0 {
		progress, _ := json.Marshal(execResult.Progress)
		task.Progress = progress
	}
}

func (s *Scheduler) setInFlight(taskID string, entry *inFlightTask) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.inFlight[taskID] = entry
}

func (s *Scheduler) clearInFlight(taskID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.inFlight, taskID)
}

func (s *Scheduler) updateInFlightHandle(taskID, handle string) {
	if handle == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if entry := s.inFlight[taskID]; entry != nil {
		entry.handle = handle
	}
}

func (s *Scheduler) inFlightEntry(taskID string) *inFlightTask {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry := s.inFlight[taskID]
	if entry == nil {
		return nil
	}
	cp := *entry
	return &cp
}

func (s *Scheduler) setInFlightCancelResult(taskID string, res *executor.Result) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if entry := s.inFlight[taskID]; entry != nil {
		entry.cancelResult = res
	}
}

func (s *Scheduler) inFlightCancelResult(taskID string) *executor.Result {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry := s.inFlight[taskID]
	if entry == nil || entry.cancelResult == nil {
		return nil
	}
	cp := *entry.cancelResult
	return &cp
}

func taskStatusIsTerminal(status models.TaskStatus) bool {
	return status.IsTerminal()
}

func (s *Scheduler) appendTaskEvent(task *models.Task, event models.RuntimeEvent) {
	if task == nil {
		return
	}
	if event.Type == "" {
		return
	}
	task.Events = append(task.Events, event)
}

func terminalTaskEvent(task *models.Task, status models.TaskStatus, runtime *models.RuntimeResult, finishedAt time.Time) models.RuntimeEvent {
	if task == nil || !status.IsTerminal() {
		return models.RuntimeEvent{}
	}
	eventType := models.RuntimeEventFailed
	message := "task failed"
	switch status {
	case models.StatusSuccess:
		eventType = models.RuntimeEventSucceeded
		message = "task succeeded"
	case models.StatusCancelled:
		eventType = models.RuntimeEventCancelled
		message = "task cancelled"
	case models.StatusSkipped:
		eventType = models.RuntimeEventFailed
		message = "task skipped"
	}
	handleID := task.HandleID
	if runtime != nil && runtime.HandleID != "" {
		handleID = runtime.HandleID
	}
	if finishedAt.IsZero() {
		finishedAt = time.Now()
	}
	return models.RuntimeEvent{
		Type:      eventType,
		TaskID:    task.ID,
		HandleID:  handleID,
		Timestamp: finishedAt,
		Message:   message,
	}
}

type canceledError struct {
	message string
}

// Error 实现 error 接口 / implements the error interface.
func (e canceledError) Error() string {
	if e.message != "" {
		return e.message
	}
	return "task cancelled"
}

// Is marks scheduler cancellation results as context cancellation so retry logic stops.
func (e canceledError) Is(target error) bool {
	return target == context.Canceled
}
