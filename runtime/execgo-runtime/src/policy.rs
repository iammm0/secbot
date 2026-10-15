//! 执行计划协商：将请求与 runtime 能力对齐 / Execution plan negotiation against runtime capabilities.
// Author: iammm0; Last edited: 2026-04-23

use crate::{
    error::{AppError, AppResult},
    types::{
        CapabilityMode, ExecutionPlan, NamespaceConfig, ResourceEnforcementPlan,
        RuntimeCapabilities, SandboxProfile, SubmitTaskRequest,
    },
};

/// resolve_execution_plan 将用户请求与 runtime 能力协商为最终执行计划 / negotiates the user request against runtime capabilities into a final execution plan.
pub fn resolve_execution_plan(
    request: &SubmitTaskRequest,
    capabilities: &RuntimeCapabilities,
    default_mode: CapabilityMode,
) -> AppResult<ExecutionPlan> {
    let strict = effective_capability_mode(request, default_mode) == CapabilityMode::Strict
        || request
            .control_context
            .as_ref()
            .map(|context| context.requires_strict_sandbox)
            .unwrap_or(false);

    let mut degraded = false;
    let mut fallback_reasons = Vec::new();
    let mut effective_sandbox = request.sandbox.clone();

    if matches!(effective_sandbox.profile, SandboxProfile::LinuxSandbox)
        && !capabilities.sandbox.linux_sandbox
    {
        if strict {
            return Err(AppError::UnsupportedCapability(
                "sandbox.profile=linux_sandbox is unavailable on this runtime".into(),
            ));
        }
        degraded = true;
        fallback_reasons
            .push("linux_sandbox is unavailable; falling back to process sandbox".into());
        effective_sandbox.profile = SandboxProfile::Process;
        effective_sandbox.chroot = false;
        effective_sandbox.rootfs = None;
        effective_sandbox.namespaces = None;
    }

    if effective_sandbox.chroot && !capabilities.sandbox.chroot {
        if strict {
            return Err(AppError::UnsupportedCapability(
                "sandbox.chroot is unavailable on this runtime".into(),
            ));
        }
        degraded = true;
        fallback_reasons.push("chroot is unavailable; running without chroot".into());
        effective_sandbox.chroot = false;
        effective_sandbox.rootfs = None;
    }

    if matches!(effective_sandbox.profile, SandboxProfile::LinuxSandbox) {
        let requested_namespaces = effective_sandbox.effective_namespaces();
        let adjusted = NamespaceConfig {
            mount: namespace_or_fallback(
                requested_namespaces.mount,
                capabilities.sandbox.namespaces.mount,
                strict,
                &mut degraded,
                &mut fallback_reasons,
                "mount",
            )?,
            pid: namespace_or_fallback(
                requested_namespaces.pid,
                capabilities.sandbox.namespaces.pid,
                strict,
                &mut degraded,
                &mut fallback_reasons,
                "pid",
            )?,
            uts: namespace_or_fallback(
                requested_namespaces.uts,
                capabilities.sandbox.namespaces.uts,
                strict,
                &mut degraded,
                &mut fallback_reasons,
                "uts",
            )?,
            ipc: namespace_or_fallback(
                requested_namespaces.ipc,
                capabilities.sandbox.namespaces.ipc,
                strict,
                &mut degraded,
                &mut fallback_reasons,
                "ipc",
            )?,
            net: namespace_or_fallback(
                requested_namespaces.net,
                capabilities.sandbox.namespaces.net,
                strict,
                &mut degraded,
                &mut fallback_reasons,
                "net",
            )?,
        };
        effective_sandbox.namespaces = Some(adjusted);
    }

    let cgroup_enforced = matches!(effective_sandbox.profile, SandboxProfile::LinuxSandbox)
        && capabilities.resources.cgroup_writable;
    let cpu_time_enforced =
        request.limits.cpu_time_sec.is_none() || capabilities.resources.rlimit_cpu;
    let memory_enforced =
        request.limits.memory_bytes.is_none() || capabilities.resources.rlimit_memory;
    let pids_enforced =
        request.limits.pids_max.is_none() || (cgroup_enforced && capabilities.resources.pids_limit);
    let oom_detection = request.limits.memory_bytes.is_some()
        && cgroup_enforced
        && capabilities.resources.oom_detection;

    if request.limits.cpu_time_sec.is_some() && !cpu_time_enforced {
        if strict {
            return Err(AppError::UnsupportedCapability(
                "cpu_time_sec enforcement is unavailable on this runtime".into(),
            ));
        }
        degraded = true;
        fallback_reasons.push("cpu_time_sec enforcement is unavailable".into());
    }

    if request.limits.memory_bytes.is_some() && !memory_enforced {
        if strict {
            return Err(AppError::UnsupportedCapability(
                "memory_bytes enforcement is unavailable on this runtime".into(),
            ));
        }
        degraded = true;
        fallback_reasons.push("memory_bytes enforcement is unavailable".into());
    }

    if request.limits.pids_max.is_some() && !pids_enforced {
        if strict {
            return Err(AppError::UnsupportedCapability(
                "pids_max enforcement requires writable cgroup support".into(),
            ));
        }
        degraded = true;
        fallback_reasons.push("pids_max enforcement requires writable cgroup support".into());
    }

    Ok(ExecutionPlan {
        capability_mode: effective_capability_mode(request, default_mode),
        requested_sandbox: request.sandbox.clone(),
        effective_sandbox,
        resource_enforcement: ResourceEnforcementPlan {
            wall_time_ms: request.limits.wall_time_ms,
            cpu_time_sec: request.limits.cpu_time_sec,
            cpu_time_enforced: request.limits.cpu_time_sec.is_some() && cpu_time_enforced,
            memory_bytes: request.limits.memory_bytes,
            memory_enforced: request.limits.memory_bytes.is_some() && memory_enforced,
            pids_max: request.limits.pids_max,
            pids_enforced: request.limits.pids_max.is_some() && pids_enforced,
            cgroup_enforced,
            oom_detection,
        },
        degraded,
        fallback_reasons,
        capability_warnings: capabilities.warnings.clone(),
    })
}

/// effective_capability_mode 解析任务生效的能力模式 / resolves the effective capability mode for a task.
pub fn effective_capability_mode(
    request: &SubmitTaskRequest,
    default_mode: CapabilityMode,
) -> CapabilityMode {
    request
        .policy
        .as_ref()
        .map(|policy| policy.capability_mode)
        .unwrap_or(default_mode)
}

/// namespace_or_fallback 在 strict 模式下报错，在 adaptive 模式下回退缺失的 namespace / errors in strict mode and falls back in adaptive mode when a namespace is unavailable.
fn namespace_or_fallback(
    requested: bool,
    supported: bool,
    strict: bool,
    degraded: &mut bool,
    fallback_reasons: &mut Vec<String>,
    namespace: &str,
) -> AppResult<bool> {
    if !requested {
        return Ok(false);
    }
    if supported {
        return Ok(true);
    }
    if strict {
        return Err(AppError::UnsupportedCapability(format!(
            "{namespace} namespace is unavailable on this runtime"
        )));
    }
    *degraded = true;
    fallback_reasons.push(format!(
        "{namespace} namespace is unavailable; running without it"
    ));
    Ok(false)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use chrono::Utc;

    use super::*;
    use crate::types::{
        ControlContext, ExecutionCapabilities, ExecutionKind, ExecutionSpec, NamespaceCapabilities,
        ResourceCapabilities, ResourceCapacity, ResourceLimits, RuntimePlatform,
        SandboxCapabilities, SandboxPolicy, StorageCapabilities, TaskPolicy,
    };

    fn capabilities(linux_sandbox: bool, cgroup_writable: bool) -> RuntimeCapabilities {
        RuntimeCapabilities {
            runtime_id: "test".into(),
            snapshot_version: "v1".into(),
            collected_at: Utc::now(),
            platform: RuntimePlatform {
                os: "test".into(),
                arch: "test".into(),
                containerized: false,
                kubernetes: false,
            },
            execution: ExecutionCapabilities {
                command: true,
                script: true,
                process_group: true,
            },
            sandbox: SandboxCapabilities {
                process: true,
                linux_sandbox,
                chroot: linux_sandbox,
                namespaces: NamespaceCapabilities {
                    mount: linux_sandbox,
                    pid: linux_sandbox,
                    uts: linux_sandbox,
                    ipc: linux_sandbox,
                    net: linux_sandbox,
                },
            },
            storage: StorageCapabilities {
                data_dir_writable: true,
            },
            resources: ResourceCapabilities {
                rlimit_cpu: true,
                rlimit_memory: true,
                cgroup_v2: cgroup_writable,
                cgroup_writable,
                memory_limit: true,
                pids_limit: cgroup_writable,
                oom_detection: cgroup_writable,
                cpu_quota: false,
                ledger: true,
                capacity: ResourceCapacity {
                    task_slots: 4,
                    memory_bytes: Some(1024),
                    pids: Some(64),
                },
            },
            stable_semantics: vec![],
            enhanced_semantics: vec![],
            warnings: vec![],
            degraded: false,
            overrides: BTreeMap::new(),
        }
    }

    fn request() -> SubmitTaskRequest {
        SubmitTaskRequest {
            task_id: None,
            execution: ExecutionSpec {
                kind: ExecutionKind::Command,
                program: Some("/bin/echo".into()),
                args: vec!["ok".into()],
                script: None,
                interpreter: None,
                env: Default::default(),
            },
            limits: ResourceLimits::default(),
            sandbox: SandboxPolicy::default(),
            policy: None,
            control_context: None,
            metadata: BTreeMap::new(),
        }
    }

    #[test]
    fn process_request_stays_stable() {
        let plan = resolve_execution_plan(
            &request(),
            &capabilities(false, false),
            CapabilityMode::Adaptive,
        )
        .expect("plan");
        assert!(!plan.degraded);
        assert_eq!(plan.effective_sandbox.profile, SandboxProfile::Process);
    }

    #[test]
    fn adaptive_linux_sandbox_falls_back() {
        let mut request = request();
        request.sandbox.profile = SandboxProfile::LinuxSandbox;

        let plan = resolve_execution_plan(
            &request,
            &capabilities(false, false),
            CapabilityMode::Adaptive,
        )
        .expect("plan");
        assert!(plan.degraded);
        assert_eq!(plan.effective_sandbox.profile, SandboxProfile::Process);
    }

    #[test]
    fn strict_linux_sandbox_rejects() {
        let mut request = request();
        request.sandbox.profile = SandboxProfile::LinuxSandbox;
        request.policy = Some(TaskPolicy {
            capability_mode: CapabilityMode::Strict,
        });

        let err = resolve_execution_plan(
            &request,
            &capabilities(false, false),
            CapabilityMode::Adaptive,
        )
        .expect_err("strict should reject");
        assert!(matches!(err, AppError::UnsupportedCapability(_)));
    }

    #[test]
    fn control_context_can_enforce_strict_sandbox() {
        let mut request = request();
        request.sandbox.profile = SandboxProfile::LinuxSandbox;
        request.control_context = Some(ControlContext {
            requires_strict_sandbox: true,
            ..ControlContext::default()
        });

        let err = resolve_execution_plan(
            &request,
            &capabilities(false, false),
            CapabilityMode::Adaptive,
        )
        .expect_err("control context should reject");
        assert!(matches!(err, AppError::UnsupportedCapability(_)));
    }
}
