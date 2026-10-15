//! SQLite 仓储：任务与事件的持久化读写 / SQLite repository: persistence for tasks and events.
// Author: iammm0; Last edited: 2026-04-23

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use chrono::{DateTime, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    types::{
        ControlContext, ErrorCode, EventRecord, EventType, ExecutionPlan, ExecutionSpec,
        ResourceLimits, ResourceUsage, RuntimeErrorInfo, SandboxPolicy, SubmitTaskRequest,
        TaskResourceReservation, TaskStatus,
    },
};

/// Repository 封装 runtime 的 SQLite 持久化入口 / wraps the SQLite persistence entrypoint for the runtime.
#[derive(Debug, Clone)]
pub struct Repository {
    db_path: PathBuf,
    conn: Arc<Mutex<Connection>>,
}

/// TaskRecord 是单个任务在数据库中的完整持久化镜像 / is the full persisted database image of a single task.
#[derive(Debug, Clone)]
pub struct TaskRecord {
    pub task_id: String,
    pub handle_id: String,
    pub status: TaskStatus,
    pub execution: ExecutionSpec,
    pub limits: ResourceLimits,
    pub sandbox: SandboxPolicy,
    pub metadata: std::collections::BTreeMap<String, String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
    pub duration_ms: Option<u64>,
    pub shim_pid: Option<u32>,
    pub pid: Option<u32>,
    pub pgid: Option<i32>,
    pub exit_code: Option<i32>,
    pub exit_signal: Option<i32>,
    pub error_code: Option<ErrorCode>,
    pub error: Option<RuntimeErrorInfo>,
    pub usage: Option<ResourceUsage>,
    pub task_dir: PathBuf,
    pub workspace_dir: PathBuf,
    pub request_path: PathBuf,
    pub result_path: PathBuf,
    pub stdout_path: PathBuf,
    pub stderr_path: PathBuf,
    pub script_path: Option<PathBuf>,
    pub stdout_max_bytes: u64,
    pub stderr_max_bytes: u64,
    pub kill_requested: bool,
    pub kill_requested_at: Option<DateTime<Utc>>,
    pub timeout_triggered: bool,
    pub result_json: Option<Value>,
    pub execution_plan: Option<ExecutionPlan>,
    pub control_context: Option<ControlContext>,
    pub reservation: Option<TaskResourceReservation>,
    pub reserved_at: Option<DateTime<Utc>>,
    pub released_at: Option<DateTime<Utc>>,
}

/// NewTaskRecord 是首次插入任务时需要落盘的字段集合 / is the set of fields required when a task is first inserted.
#[derive(Debug, Clone)]
pub struct NewTaskRecord {
    pub task_id: String,
    pub request: SubmitTaskRequest,
    pub task_dir: PathBuf,
    pub workspace_dir: PathBuf,
    pub request_path: PathBuf,
    pub result_path: PathBuf,
    pub stdout_path: PathBuf,
    pub stderr_path: PathBuf,
    pub script_path: Option<PathBuf>,
    pub execution_plan: ExecutionPlan,
    pub control_context: Option<ControlContext>,
}

/// CompletionUpdate 描述任务结束时需要回写的终态信息 / describes the terminal state written back when a task finishes.
#[derive(Debug, Clone)]
pub struct CompletionUpdate {
    pub status: TaskStatus,
    pub finished_at: DateTime<Utc>,
    pub duration_ms: Option<u64>,
    pub exit_code: Option<i32>,
    pub exit_signal: Option<i32>,
    pub error: Option<RuntimeErrorInfo>,
    pub usage: Option<ResourceUsage>,
    pub result_json: Option<Value>,
}

/// MetricsSnapshot 是从任务表聚合得到的指标摘要 / is the metrics summary aggregated from the task table.
#[derive(Debug, Clone, Default)]
pub struct MetricsSnapshot {
    pub by_status: std::collections::BTreeMap<String, u64>,
    pub by_error_code: std::collections::BTreeMap<String, u64>,
    pub finished_durations_ms: Vec<u64>,
}

impl TaskRecord {
    /// has_active_reservation 判断任务是否仍持有未释放的资源预留 / reports whether the task still holds an unreleased resource reservation.
    pub fn has_active_reservation(&self) -> bool {
        self.reservation.is_some() && self.released_at.is_none()
    }
}

impl Repository {
    /// new 创建指向指定 SQLite 文件的仓储实例 / creates a repository bound to the given SQLite database file.
    pub fn new(db_path: impl Into<PathBuf>) -> AppResult<Self> {
        let db_path = db_path.into();
        let conn = Self::open_connection(&db_path)?;
        Ok(Self {
            db_path,
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }

    /// init 初始化任务表、事件表以及兼容性迁移列 / initializes task tables, event tables, and compatibility migration columns.
    pub fn init(&self) -> AppResult<()> {
        if let Some(parent) = self.db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = self.conn()?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS tasks (
                task_id TEXT PRIMARY KEY,
                handle_id TEXT NOT NULL,
                status TEXT NOT NULL,
                execution_json TEXT NOT NULL,
                limits_json TEXT NOT NULL,
                sandbox_json TEXT NOT NULL,
                metadata_json TEXT NOT NULL,
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL,
                started_at_ms INTEGER NULL,
                finished_at_ms INTEGER NULL,
                duration_ms INTEGER NULL,
                shim_pid INTEGER NULL,
                pid INTEGER NULL,
                pgid INTEGER NULL,
                exit_code INTEGER NULL,
                exit_signal INTEGER NULL,
                error_code TEXT NULL,
                error_json TEXT NULL,
                usage_json TEXT NULL,
                task_dir TEXT NOT NULL,
                workspace_dir TEXT NOT NULL,
                request_path TEXT NOT NULL,
                result_path TEXT NOT NULL,
                stdout_path TEXT NOT NULL,
                stderr_path TEXT NOT NULL,
                script_path TEXT NULL,
                stdout_max_bytes INTEGER NOT NULL,
                stderr_max_bytes INTEGER NOT NULL,
                kill_requested INTEGER NOT NULL DEFAULT 0,
                kill_requested_at_ms INTEGER NULL,
                timeout_triggered INTEGER NOT NULL DEFAULT 0,
                result_json TEXT NULL,
                execution_plan_json TEXT NULL,
                control_context_json TEXT NULL,
                reservation_json TEXT NULL,
                reserved_at_ms INTEGER NULL,
                released_at_ms INTEGER NULL
            );

            CREATE TABLE IF NOT EXISTS task_events (
                seq INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                timestamp_ms INTEGER NOT NULL,
                message TEXT NULL,
                data_json TEXT NULL,
                FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks(status, created_at_ms);
            CREATE INDEX IF NOT EXISTS idx_tasks_finished_at ON tasks(finished_at_ms);
            CREATE INDEX IF NOT EXISTS idx_task_events_task_id_seq ON task_events(task_id, seq);
            "#,
        )?;
        ensure_task_column(&conn, "execution_plan_json", "TEXT NULL")?;
        ensure_task_column(&conn, "control_context_json", "TEXT NULL")?;
        ensure_task_column(&conn, "reservation_json", "TEXT NULL")?;
        ensure_task_column(&conn, "reserved_at_ms", "INTEGER NULL")?;
        ensure_task_column(&conn, "released_at_ms", "INTEGER NULL")?;
        Ok(())
    }

    /// insert_task 在单个事务内插入任务主记录和初始事件 / inserts the task row and initial events in a single transaction.
    pub fn insert_task(&self, new_task: &NewTaskRecord) -> AppResult<()> {
        let now = Utc::now();
        let conn = self.conn()?;
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            r#"
            INSERT INTO tasks (
                task_id, handle_id, status,
                execution_json, limits_json, sandbox_json, metadata_json,
                created_at_ms, updated_at_ms,
                task_dir, workspace_dir, request_path, result_path, stdout_path, stderr_path, script_path,
                stdout_max_bytes, stderr_max_bytes, execution_plan_json, control_context_json
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
            "#,
            params![
                new_task.task_id,
                new_task.task_id,
                encode_status(TaskStatus::Accepted),
                to_json(&new_task.request.execution)?,
                to_json(&new_task.request.limits)?,
                to_json(&new_task.request.sandbox)?,
                to_json(&new_task.request.metadata)?,
                now.timestamp_millis(),
                now.timestamp_millis(),
                new_task.task_dir.to_string_lossy().to_string(),
                new_task.workspace_dir.to_string_lossy().to_string(),
                new_task.request_path.to_string_lossy().to_string(),
                new_task.result_path.to_string_lossy().to_string(),
                new_task.stdout_path.to_string_lossy().to_string(),
                new_task.stderr_path.to_string_lossy().to_string(),
                new_task
                    .script_path
                    .as_ref()
                    .map(|p| p.to_string_lossy().to_string()),
                i64::try_from(new_task.request.limits.stdout_max_bytes)
                    .map_err(|_| AppError::InvalidInput("stdout_max_bytes is too large".into()))?,
                i64::try_from(new_task.request.limits.stderr_max_bytes)
                    .map_err(|_| AppError::InvalidInput("stderr_max_bytes is too large".into()))?,
                to_json(&new_task.execution_plan)?,
                new_task.control_context.as_ref().map(to_json).transpose()?,
            ],
        )
        .map_err(|err| {
            if let rusqlite::Error::SqliteFailure(code, _) = &err {
                if code.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_PRIMARYKEY {
                    return AppError::Conflict(format!("task {} already exists", new_task.task_id));
                }
            }
            AppError::Sqlite(err)
        })?;
        insert_event_tx(
            &tx,
            &new_task.task_id,
            EventType::Submitted,
            Some("task submitted"),
            None,
        )?;
        insert_event_tx(
            &tx,
            &new_task.task_id,
            EventType::Accepted,
            Some("task accepted"),
            None,
        )?;
        insert_event_tx(
            &tx,
            &new_task.task_id,
            EventType::Planned,
            Some("execution plan resolved"),
            Some(&serde_json::to_value(&new_task.execution_plan)?),
        )?;
        if new_task.execution_plan.degraded {
            insert_event_tx(
                &tx,
                &new_task.task_id,
                EventType::Degraded,
                Some("execution plan degraded"),
                Some(&serde_json::json!({
                    "fallback_reasons": &new_task.execution_plan.fallback_reasons,
                    "effective_sandbox": &new_task.execution_plan.effective_sandbox,
                })),
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// get_task 按 task_id 读取完整任务记录 / loads the full task record by task_id.
    pub fn get_task(&self, task_id: &str) -> AppResult<TaskRecord> {
        let conn = self.conn()?;
        let task = conn
            .query_row(
                "SELECT * FROM tasks WHERE task_id = ?1",
                params![task_id],
                row_to_task_record,
            )
            .optional()?;
        task.ok_or_else(|| AppError::NotFound(task_id.to_string()))
    }

    /// list_events 返回任务的持久化事件流 / returns the persisted event stream of a task.
    pub fn list_events(&self, task_id: &str) -> AppResult<Vec<EventRecord>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT seq, task_id, event_type, timestamp_ms, message, data_json FROM task_events WHERE task_id = ?1 ORDER BY seq ASC",
        )?;
        let iter = stmt.query_map(params![task_id], |row| {
            Ok(EventRecord {
                seq: row.get(0)?,
                task_id: row.get(1)?,
                event_type: decode_event_type(row.get::<_, String>(2)?.as_str())?,
                timestamp: ts_millis_to_utc(row.get(3)?),
                message: row.get(4)?,
                data: opt_json_value(row.get(5)?)?,
            })
        })?;
        let mut events = Vec::new();
        for item in iter {
            events.push(item?);
        }
        Ok(events)
    }

    pub fn count_accepted(&self) -> AppResult<u64> {
        self.count_by_status(TaskStatus::Accepted)
    }

    pub fn count_running(&self) -> AppResult<u64> {
        self.count_by_status(TaskStatus::Running)
    }

    /// count_by_status 统计指定状态的任务数量 / counts tasks in the given status.
    pub fn count_by_status(&self, status: TaskStatus) -> AppResult<u64> {
        let conn = self.conn()?;
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM tasks WHERE status = ?1",
            params![encode_status(status)],
            |row| row.get(0),
        )?;
        Ok(count.max(0) as u64)
    }

    /// list_accepted 按创建时间返回待调度任务 / returns accepted tasks ordered by creation time for dispatch.
    pub fn list_accepted(&self, limit: usize) -> AppResult<Vec<TaskRecord>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT * FROM tasks WHERE status = 'accepted' ORDER BY created_at_ms ASC LIMIT ?1",
        )?;
        let iter = stmt.query_map(params![limit as i64], row_to_task_record)?;
        let mut items = Vec::new();
        for item in iter {
            items.push(item?);
        }
        Ok(items)
    }

    /// list_non_terminal 返回恢复流程需要关注的未终态任务 / returns non-terminal tasks that recovery logic must inspect.
    pub fn list_non_terminal(&self) -> AppResult<Vec<TaskRecord>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT * FROM tasks WHERE status IN ('accepted', 'running') ORDER BY created_at_ms ASC",
        )?;
        let iter = stmt.query_map([], row_to_task_record)?;
        let mut items = Vec::new();
        for item in iter {
            items.push(item?);
        }
        Ok(items)
    }

    /// list_active_reservations 返回当前仍占用资源账本额度的任务 / returns tasks that still hold resource ledger reservations.
    pub fn list_active_reservations(&self) -> AppResult<Vec<TaskRecord>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT * FROM tasks WHERE reservation_json IS NOT NULL AND released_at_ms IS NULL ORDER BY reserved_at_ms ASC, created_at_ms ASC",
        )?;
        let iter = stmt.query_map([], row_to_task_record)?;
        let mut items = Vec::new();
        for item in iter {
            items.push(item?);
        }
        Ok(items)
    }

    /// count_accepted_waiting 统计还未拿到资源预留的 accepted 任务 / counts accepted tasks that are still waiting for a reservation.
    pub fn count_accepted_waiting(&self) -> AppResult<u64> {
        let conn = self.conn()?;
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM tasks WHERE status = 'accepted' AND (reservation_json IS NULL OR released_at_ms IS NOT NULL)",
            [],
            |row| row.get(0),
        )?;
        Ok(count.max(0) as u64)
    }

    /// mark_dispatched 标记任务已被 shim 接管调度 / marks a task as dispatched to the shim process.
    pub fn mark_dispatched(&self, task_id: &str, shim_pid: u32) -> AppResult<()> {
        let now = Utc::now().timestamp_millis();
        let conn = self.conn()?;
        conn.execute(
            "UPDATE tasks SET status = 'running', shim_pid = ?2, updated_at_ms = ?3 WHERE task_id = ?1 AND status = 'accepted'",
            params![task_id, i64::from(shim_pid), now],
        )?;
        Ok(())
    }

    /// mark_started 标记任务实际业务进程已启动 / marks that the actual workload process has started.
    pub fn mark_started(
        &self,
        task_id: &str,
        pid: u32,
        pgid: i32,
        script_path: Option<&Path>,
    ) -> AppResult<()> {
        let now = Utc::now();
        let conn = self.conn()?;
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "UPDATE tasks SET status = 'running', pid = ?2, pgid = ?3, started_at_ms = ?4, updated_at_ms = ?4, script_path = COALESCE(?5, script_path) WHERE task_id = ?1",
            params![
                task_id,
                i64::from(pid),
                pgid,
                now.timestamp_millis(),
                script_path.map(|p| p.to_string_lossy().to_string())
            ],
        )?;
        insert_event_tx(&tx, task_id, EventType::Started, Some("task started"), None)?;
        tx.commit()?;
        Ok(())
    }

    /// reserve_resources 为任务记录资源预留并写入事件 / records a resource reservation for the task and emits an event.
    pub fn reserve_resources(
        &self,
        task_id: &str,
        reservation: &TaskResourceReservation,
        message: &str,
    ) -> AppResult<()> {
        let now = Utc::now();
        let conn = self.conn()?;
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "UPDATE tasks SET reservation_json = ?2, reserved_at_ms = ?3, released_at_ms = NULL, updated_at_ms = ?3 WHERE task_id = ?1",
            params![
                task_id,
                to_json(reservation)?,
                now.timestamp_millis(),
            ],
        )?;
        insert_event_tx(
            &tx,
            task_id,
            EventType::ResourceReserved,
            Some(message),
            Some(&serde_json::to_value(reservation)?),
        )?;
        tx.commit()?;
        Ok(())
    }

    /// release_resources 释放任务资源预留并写入事件 / releases the task reservation and emits an event.
    pub fn release_resources(&self, task_id: &str, message: &str) -> AppResult<()> {
        let now = Utc::now();
        let conn = self.conn()?;
        let tx = conn.unchecked_transaction()?;
        let reservation_json: Option<String> = tx
            .query_row(
                "SELECT reservation_json FROM tasks WHERE task_id = ?1 AND reservation_json IS NOT NULL AND released_at_ms IS NULL",
                params![task_id],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(raw) = reservation_json {
            let reservation: TaskResourceReservation =
                serde_json::from_str(&raw).map_err(AppError::Json)?;
            tx.execute(
                "UPDATE tasks SET released_at_ms = ?2, updated_at_ms = ?2 WHERE task_id = ?1",
                params![task_id, now.timestamp_millis()],
            )?;
            insert_event_tx(
                &tx,
                task_id,
                EventType::ResourceReleased,
                Some(message),
                Some(&serde_json::to_value(reservation)?),
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// set_cancel_requested 标记任务收到取消请求 / marks that the task has received a cancellation request.
    pub fn set_cancel_requested(&self, task_id: &str) -> AppResult<TaskRecord> {
        let now = Utc::now();
        let conn = self.conn()?;
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "UPDATE tasks SET kill_requested = 1, kill_requested_at_ms = ?2, updated_at_ms = ?2 WHERE task_id = ?1",
            params![task_id, now.timestamp_millis()],
        )?;
        insert_event_tx(
            &tx,
            task_id,
            EventType::KillRequested,
            Some("kill requested"),
            None,
        )?;
        tx.commit()?;
        drop(conn);
        self.get_task(task_id)
    }

    /// mark_timeout_triggered 记录任务已命中 wall time 超时 / records that the task has hit the wall-time timeout.
    pub fn mark_timeout_triggered(&self, task_id: &str) -> AppResult<()> {
        let now = Utc::now();
        let conn = self.conn()?;
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "UPDATE tasks SET timeout_triggered = 1, updated_at_ms = ?2 WHERE task_id = ?1",
            params![task_id, now.timestamp_millis()],
        )?;
        insert_event_tx(
            &tx,
            task_id,
            EventType::TimeoutTriggered,
            Some("timeout triggered"),
            None,
        )?;
        tx.commit()?;
        Ok(())
    }

    /// cancel_accepted_task 将尚未启动的 accepted 任务直接转为 cancelled / converts an accepted-but-not-started task directly into cancelled.
    pub fn cancel_accepted_task(&self, task_id: &str, error: RuntimeErrorInfo) -> AppResult<()> {
        let now = Utc::now();
        let conn = self.conn()?;
        let tx = conn.unchecked_transaction()?;
        let active_reservation_json: Option<String> = tx
            .query_row(
                "SELECT reservation_json FROM tasks WHERE task_id = ?1 AND reservation_json IS NOT NULL AND released_at_ms IS NULL",
                params![task_id],
                |row| row.get(0),
            )
            .optional()?;
        tx.execute(
            r#"
            UPDATE tasks
            SET status = 'cancelled',
                updated_at_ms = ?2,
                finished_at_ms = ?2,
                released_at_ms = CASE
                    WHEN released_at_ms IS NULL AND reservation_json IS NOT NULL THEN ?2
                    ELSE released_at_ms
                END,
                error_code = ?3,
                error_json = ?4,
                duration_ms = 0,
                result_json = ?5
            WHERE task_id = ?1 AND status = 'accepted'
            "#,
            params![
                task_id,
                now.timestamp_millis(),
                encode_error_code(error.code),
                to_json(&error)?,
                to_json(&serde_json::json!({
                        "task_id": task_id,
                        "handle_id": task_id,
                        "status": TaskStatus::Cancelled,
                        "finished_at": now,
                    "error": error,
                }))?,
            ],
        )?;
        if let Some(raw) = active_reservation_json {
            let reservation: TaskResourceReservation =
                serde_json::from_str(&raw).map_err(AppError::Json)?;
            insert_event_tx(
                &tx,
                task_id,
                EventType::ResourceReleased,
                Some("task resources released"),
                Some(&serde_json::to_value(reservation)?),
            )?;
        }
        insert_event_tx(
            &tx,
            task_id,
            EventType::Cancelled,
            Some("task cancelled"),
            None,
        )?;
        tx.commit()?;
        Ok(())
    }

    /// complete_task 写入终态、错误、资源使用和释放事件 / writes terminal state, error details, resource usage, and release events.
    pub fn complete_task(&self, task_id: &str, update: &CompletionUpdate) -> AppResult<()> {
        let conn = self.conn()?;
        let tx = conn.unchecked_transaction()?;
        let active_reservation_json: Option<String> = tx
            .query_row(
                "SELECT reservation_json FROM tasks WHERE task_id = ?1 AND reservation_json IS NOT NULL AND released_at_ms IS NULL",
                params![task_id],
                |row| row.get(0),
            )
            .optional()?;
        tx.execute(
            r#"
            UPDATE tasks
            SET status = ?2,
                updated_at_ms = ?3,
                finished_at_ms = ?3,
                released_at_ms = CASE
                    WHEN released_at_ms IS NULL AND reservation_json IS NOT NULL THEN ?3
                    ELSE released_at_ms
                END,
                duration_ms = ?4,
                exit_code = ?5,
                exit_signal = ?6,
                error_code = ?7,
                error_json = ?8,
                usage_json = ?9,
                result_json = ?10
            WHERE task_id = ?1
            "#,
            params![
                task_id,
                encode_status(update.status.clone()),
                update.finished_at.timestamp_millis(),
                update
                    .duration_ms
                    .map(i64::try_from)
                    .transpose()
                    .map_err(|_| {
                        AppError::InvalidInput("duration_ms is too large to persist".into())
                    })?,
                update.exit_code,
                update.exit_signal,
                update.error.as_ref().map(|e| encode_error_code(e.code)),
                update.error.as_ref().map(to_json).transpose()?,
                update.usage.as_ref().map(to_json).transpose()?,
                update.result_json.as_ref().map(to_json).transpose()?,
            ],
        )?;

        if let Some(raw) = active_reservation_json {
            let reservation: TaskResourceReservation =
                serde_json::from_str(&raw).map_err(AppError::Json)?;
            insert_event_tx(
                &tx,
                task_id,
                EventType::ResourceReleased,
                Some("task resources released"),
                Some(&serde_json::to_value(reservation)?),
            )?;
        }

        let event_type = match update.status {
            TaskStatus::Success => EventType::Finished,
            TaskStatus::Failed => EventType::Failed,
            TaskStatus::Cancelled => EventType::Cancelled,
            TaskStatus::Accepted | TaskStatus::Running => EventType::Finished,
        };
        let message = match update.status {
            TaskStatus::Success => Some("task finished"),
            TaskStatus::Failed => Some("task failed"),
            TaskStatus::Cancelled => Some("task cancelled"),
            TaskStatus::Accepted | TaskStatus::Running => Some("task finished"),
        };
        insert_event_tx(&tx, task_id, event_type, message, None)?;
        tx.commit()?;
        Ok(())
    }

    /// mark_recovered 记录运行中任务在恢复流程中被重新接管 / records that a running task was successfully reattached during recovery.
    pub fn mark_recovered(&self, task_id: &str) -> AppResult<()> {
        let now = Utc::now();
        let conn = self.conn()?;
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "UPDATE tasks SET updated_at_ms = ?2 WHERE task_id = ?1 AND status = 'running'",
            params![task_id, now.timestamp_millis()],
        )?;
        insert_event_tx(
            &tx,
            task_id,
            EventType::Recovered,
            Some("task recovered"),
            None,
        )?;
        tx.commit()?;
        Ok(())
    }

    /// mark_recovery_lost 将恢复失败的任务标记为内部错误 / marks a task as internal failure when recovery loses ownership.
    pub fn mark_recovery_lost(&self, task_id: &str) -> AppResult<()> {
        let update = CompletionUpdate {
            status: TaskStatus::Failed,
            finished_at: Utc::now(),
            duration_ms: Some(0),
            exit_code: None,
            exit_signal: None,
            error: Some(RuntimeErrorInfo {
                code: ErrorCode::Internal,
                message: "recovery_lost".into(),
                details: None,
            }),
            usage: None,
            result_json: None,
        };
        self.complete_task(task_id, &update)
    }

    /// is_cancel_requested 查询任务是否收到取消信号 / checks whether cancellation has been requested for the task.
    pub fn is_cancel_requested(&self, task_id: &str) -> AppResult<bool> {
        let conn = self.conn()?;
        let flag: i64 = conn.query_row(
            "SELECT kill_requested FROM tasks WHERE task_id = ?1",
            params![task_id],
            |row| row.get(0),
        )?;
        Ok(flag != 0)
    }

    /// list_gc_candidates 列出超过保留期、可被回收的终态任务 / lists terminal tasks that exceeded retention and can be garbage-collected.
    pub fn list_gc_candidates(&self, finished_before: DateTime<Utc>) -> AppResult<Vec<TaskRecord>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT * FROM tasks WHERE status IN ('success', 'failed', 'cancelled') AND finished_at_ms IS NOT NULL AND finished_at_ms <= ?1 ORDER BY finished_at_ms ASC",
        )?;
        let iter = stmt.query_map(
            params![finished_before.timestamp_millis()],
            row_to_task_record,
        )?;
        let mut items = Vec::new();
        for item in iter {
            items.push(item?);
        }
        Ok(items)
    }

    /// delete_task 删除任务主记录及其级联事件 / deletes the task row and its cascaded events.
    pub fn delete_task(&self, task_id: &str) -> AppResult<()> {
        let conn = self.conn()?;
        conn.execute("DELETE FROM tasks WHERE task_id = ?1", params![task_id])?;
        Ok(())
    }

    /// metrics_snapshot 聚合状态、错误码和时长指标 / aggregates status, error-code, and duration metrics.
    pub fn metrics_snapshot(&self) -> AppResult<MetricsSnapshot> {
        let conn = self.conn()?;
        let mut snapshot = MetricsSnapshot::default();

        let mut status_stmt = conn.prepare("SELECT status, COUNT(*) FROM tasks GROUP BY status")?;
        let status_rows = status_stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        for item in status_rows {
            let (status, count) = item?;
            snapshot.by_status.insert(status, count.max(0) as u64);
        }

        let mut err_stmt = conn.prepare(
            "SELECT error_code, COUNT(*) FROM tasks WHERE error_code IS NOT NULL GROUP BY error_code",
        )?;
        let err_rows = err_stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        for item in err_rows {
            let (code, count) = item?;
            snapshot.by_error_code.insert(code, count.max(0) as u64);
        }

        let mut duration_stmt =
            conn.prepare("SELECT duration_ms FROM tasks WHERE duration_ms IS NOT NULL")?;
        let duration_rows = duration_stmt.query_map([], |row| row.get::<_, i64>(0))?;
        for item in duration_rows {
            snapshot.finished_durations_ms.push(item?.max(0) as u64);
        }

        Ok(snapshot)
    }

    fn open_connection(db_path: &Path) -> AppResult<Connection> {
        let conn = Connection::open(db_path)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        Ok(conn)
    }

    fn conn(&self) -> AppResult<std::sync::MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|_| AppError::Internal("repository mutex poisoned".into()))
    }
}

/// generate_task_id 生成新的随机任务 ID / generates a new random task ID.
pub fn generate_task_id() -> String {
    Uuid::new_v4().to_string()
}

/// ensure_task_column 在迁移场景下补齐缺失列 / adds a missing task table column during lightweight migrations.
fn ensure_task_column(conn: &Connection, name: &str, definition: &str) -> AppResult<()> {
    let mut stmt = conn.prepare("PRAGMA table_info(tasks)")?;
    let columns = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for column in columns {
        if column? == name {
            return Ok(());
        }
    }
    conn.execute(
        &format!("ALTER TABLE tasks ADD COLUMN {name} {definition}"),
        [],
    )?;
    Ok(())
}

/// row_to_task_record 将数据库行解码为完整任务记录 / decodes a database row into a full task record.
fn row_to_task_record(row: &Row<'_>) -> rusqlite::Result<TaskRecord> {
    Ok(TaskRecord {
        task_id: row.get("task_id")?,
        handle_id: row.get("handle_id")?,
        status: decode_status(row.get::<_, String>("status")?.as_str())?,
        execution: from_json(row.get("execution_json")?)?,
        limits: from_json(row.get("limits_json")?)?,
        sandbox: from_json(row.get("sandbox_json")?)?,
        metadata: from_json(row.get("metadata_json")?)?,
        created_at: ts_millis_to_utc(row.get("created_at_ms")?),
        updated_at: ts_millis_to_utc(row.get("updated_at_ms")?),
        started_at: row
            .get::<_, Option<i64>>("started_at_ms")?
            .map(ts_millis_to_utc),
        finished_at: row
            .get::<_, Option<i64>>("finished_at_ms")?
            .map(ts_millis_to_utc),
        duration_ms: row
            .get::<_, Option<i64>>("duration_ms")?
            .map(|value| value.max(0) as u64),
        shim_pid: row
            .get::<_, Option<i64>>("shim_pid")?
            .map(|value| value as u32),
        pid: row.get::<_, Option<i64>>("pid")?.map(|value| value as u32),
        pgid: row.get("pgid")?,
        exit_code: row.get("exit_code")?,
        exit_signal: row.get("exit_signal")?,
        error_code: row
            .get::<_, Option<String>>("error_code")?
            .map(|value| decode_error_code(value.as_str()))
            .transpose()?,
        error: row
            .get::<_, Option<String>>("error_json")?
            .map(from_json)
            .transpose()?,
        usage: row
            .get::<_, Option<String>>("usage_json")?
            .map(from_json)
            .transpose()?,
        task_dir: PathBuf::from(row.get::<_, String>("task_dir")?),
        workspace_dir: PathBuf::from(row.get::<_, String>("workspace_dir")?),
        request_path: PathBuf::from(row.get::<_, String>("request_path")?),
        result_path: PathBuf::from(row.get::<_, String>("result_path")?),
        stdout_path: PathBuf::from(row.get::<_, String>("stdout_path")?),
        stderr_path: PathBuf::from(row.get::<_, String>("stderr_path")?),
        script_path: row
            .get::<_, Option<String>>("script_path")?
            .map(PathBuf::from),
        stdout_max_bytes: row.get::<_, i64>("stdout_max_bytes")?.max(0) as u64,
        stderr_max_bytes: row.get::<_, i64>("stderr_max_bytes")?.max(0) as u64,
        kill_requested: row.get::<_, i64>("kill_requested")? != 0,
        kill_requested_at: row
            .get::<_, Option<i64>>("kill_requested_at_ms")?
            .map(ts_millis_to_utc),
        timeout_triggered: row.get::<_, i64>("timeout_triggered")? != 0,
        result_json: row
            .get::<_, Option<String>>("result_json")?
            .map(from_json)
            .transpose()?,
        execution_plan: row
            .get::<_, Option<String>>("execution_plan_json")?
            .map(from_json)
            .transpose()?,
        control_context: row
            .get::<_, Option<String>>("control_context_json")?
            .map(from_json)
            .transpose()?,
        reservation: row
            .get::<_, Option<String>>("reservation_json")?
            .map(from_json)
            .transpose()?,
        reserved_at: row
            .get::<_, Option<i64>>("reserved_at_ms")?
            .map(ts_millis_to_utc),
        released_at: row
            .get::<_, Option<i64>>("released_at_ms")?
            .map(ts_millis_to_utc),
    })
}

/// insert_event_tx 在现有事务内追加一条任务事件 / appends a task event within an existing transaction.
fn insert_event_tx(
    tx: &rusqlite::Transaction<'_>,
    task_id: &str,
    event_type: EventType,
    message: Option<&str>,
    data: Option<&Value>,
) -> AppResult<()> {
    tx.execute(
        "INSERT INTO task_events (task_id, event_type, timestamp_ms, message, data_json) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            task_id,
            encode_event_type(event_type),
            Utc::now().timestamp_millis(),
            message,
            data.map(to_json).transpose()?,
        ],
    )?;
    Ok(())
}

/// to_json 将结构体编码为 JSON 文本以便写入 SQLite / encodes a value into JSON text for SQLite persistence.
fn to_json<T: Serialize>(value: &T) -> AppResult<String> {
    Ok(serde_json::to_string(value)?)
}

/// from_json 将 SQLite 中的 JSON 文本反序列化为目标类型 / deserializes JSON text stored in SQLite into the target type.
fn from_json<T: DeserializeOwned>(raw: String) -> rusqlite::Result<T> {
    serde_json::from_str(&raw).map_err(|err| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(err))
    })
}

/// opt_json_value 将可选 JSON 字符串解码为 serde_json::Value / decodes an optional JSON string into serde_json::Value.
fn opt_json_value(raw: Option<String>) -> rusqlite::Result<Option<Value>> {
    raw.map(from_json).transpose()
}

/// encode_status 将 TaskStatus 转为稳定的数据库枚举字符串 / converts TaskStatus into the stable database enum string.
fn encode_status(status: TaskStatus) -> &'static str {
    match status {
        TaskStatus::Accepted => "accepted",
        TaskStatus::Running => "running",
        TaskStatus::Success => "success",
        TaskStatus::Failed => "failed",
        TaskStatus::Cancelled => "cancelled",
    }
}

/// decode_status 将数据库状态字符串还原为 TaskStatus / restores TaskStatus from the database status string.
fn decode_status(value: &str) -> rusqlite::Result<TaskStatus> {
    match value {
        "accepted" => Ok(TaskStatus::Accepted),
        "running" => Ok(TaskStatus::Running),
        "success" => Ok(TaskStatus::Success),
        "failed" => Ok(TaskStatus::Failed),
        "cancelled" => Ok(TaskStatus::Cancelled),
        other => Err(rusqlite::Error::InvalidColumnType(
            0,
            other.into(),
            rusqlite::types::Type::Text,
        )),
    }
}

/// encode_error_code 将 ErrorCode 转为稳定的数据库字符串 / converts ErrorCode into the stable database string.
fn encode_error_code(code: ErrorCode) -> &'static str {
    match code {
        ErrorCode::InvalidInput => "invalid_input",
        ErrorCode::LaunchFailed => "launch_failed",
        ErrorCode::Timeout => "timeout",
        ErrorCode::Cancelled => "cancelled",
        ErrorCode::MemoryLimitExceeded => "memory_limit_exceeded",
        ErrorCode::CpuLimitExceeded => "cpu_limit_exceeded",
        ErrorCode::ResourceLimitExceeded => "resource_limit_exceeded",
        ErrorCode::SandboxSetupFailed => "sandbox_setup_failed",
        ErrorCode::ExitNonZero => "exit_nonzero",
        ErrorCode::UnsupportedCapability => "unsupported_capability",
        ErrorCode::InsufficientResources => "insufficient_resources",
        ErrorCode::NotFound => "not_found",
        ErrorCode::Conflict => "conflict",
        ErrorCode::PermissionDenied => "permission_denied",
        ErrorCode::Internal => "internal",
    }
}

/// decode_error_code 将数据库错误码字符串还原为 ErrorCode / restores ErrorCode from the database error-code string.
fn decode_error_code(value: &str) -> rusqlite::Result<ErrorCode> {
    match value {
        "invalid_input" => Ok(ErrorCode::InvalidInput),
        "launch_failed" => Ok(ErrorCode::LaunchFailed),
        "timeout" => Ok(ErrorCode::Timeout),
        "cancelled" => Ok(ErrorCode::Cancelled),
        "memory_limit_exceeded" => Ok(ErrorCode::MemoryLimitExceeded),
        "cpu_limit_exceeded" => Ok(ErrorCode::CpuLimitExceeded),
        "resource_limit_exceeded" => Ok(ErrorCode::ResourceLimitExceeded),
        "sandbox_setup_failed" => Ok(ErrorCode::SandboxSetupFailed),
        "exit_nonzero" => Ok(ErrorCode::ExitNonZero),
        "unsupported_capability" => Ok(ErrorCode::UnsupportedCapability),
        "insufficient_resources" => Ok(ErrorCode::InsufficientResources),
        "not_found" => Ok(ErrorCode::NotFound),
        "conflict" => Ok(ErrorCode::Conflict),
        "permission_denied" => Ok(ErrorCode::PermissionDenied),
        "internal" => Ok(ErrorCode::Internal),
        other => Err(rusqlite::Error::InvalidColumnType(
            0,
            other.into(),
            rusqlite::types::Type::Text,
        )),
    }
}

/// encode_event_type 将事件类型转为数据库字符串 / converts an event type into the database string representation.
fn encode_event_type(event_type: EventType) -> &'static str {
    match event_type {
        EventType::Submitted => "submitted",
        EventType::Accepted => "accepted",
        EventType::Planned => "planned",
        EventType::Degraded => "degraded",
        EventType::ResourceReserved => "resource_reserved",
        EventType::ResourceReleased => "resource_released",
        EventType::Started => "started",
        EventType::KillRequested => "kill_requested",
        EventType::TimeoutTriggered => "timeout_triggered",
        EventType::Finished => "finished",
        EventType::Failed => "failed",
        EventType::Cancelled => "cancelled",
        EventType::Recovered => "recovered",
    }
}

/// decode_event_type 将数据库事件类型字符串还原为枚举 / restores an event type enum from the database string.
fn decode_event_type(value: &str) -> rusqlite::Result<EventType> {
    match value {
        "submitted" => Ok(EventType::Submitted),
        "accepted" => Ok(EventType::Accepted),
        "planned" => Ok(EventType::Planned),
        "degraded" => Ok(EventType::Degraded),
        "resource_reserved" => Ok(EventType::ResourceReserved),
        "resource_released" => Ok(EventType::ResourceReleased),
        "started" => Ok(EventType::Started),
        "kill_requested" => Ok(EventType::KillRequested),
        "timeout_triggered" => Ok(EventType::TimeoutTriggered),
        "finished" => Ok(EventType::Finished),
        "failed" => Ok(EventType::Failed),
        "cancelled" => Ok(EventType::Cancelled),
        "recovered" => Ok(EventType::Recovered),
        other => Err(rusqlite::Error::InvalidColumnType(
            0,
            other.into(),
            rusqlite::types::Type::Text,
        )),
    }
}

/// ts_millis_to_utc 将毫秒时间戳转为 UTC 时间 / converts a millisecond timestamp into a UTC datetime.
fn ts_millis_to_utc(value: i64) -> DateTime<Utc> {
    Utc.timestamp_millis_opt(value)
        .single()
        .unwrap_or_else(Utc::now)
}
