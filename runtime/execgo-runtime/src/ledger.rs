//! 资源账本：容量、预留与可用量计算 / Resource ledger: capacity, reservations, and availability computations.
// Author: iammm0; Last edited: 2026-04-23

use std::collections::BTreeMap;

use crate::{
    error::{AppError, AppResult},
    types::{ResourceCapacity, RuntimeResourcesResponse, TaskResourceReservation},
};

/// ResourceLedger 维护 runtime 的资源容量、预留和可用量计算，含每租户软上限 / maintains runtime capacity, reservations, available-resource calculations, and per-tenant soft quotas.
#[derive(Debug, Clone)]
pub struct ResourceLedger {
    capacity: ResourceCapacity,
    tenant_quotas: BTreeMap<String, ResourceCapacity>,
}

impl ResourceLedger {
    /// new 使用给定容量创建资源账本（无租户配额）/ creates a resource ledger from the given capacity with no tenant quotas.
    pub fn new(capacity: ResourceCapacity) -> Self {
        Self::with_tenant_quotas(capacity, BTreeMap::new())
    }

    /// with_tenant_quotas 使用容量和租户软上限映射创建资源账本 / creates a resource ledger with capacity and a per-tenant soft-quota map.
    pub fn with_tenant_quotas(
        capacity: ResourceCapacity,
        quotas: BTreeMap<String, ResourceCapacity>,
    ) -> Self {
        Self {
            capacity,
            tenant_quotas: quotas,
        }
    }

    /// capacity 返回账本的总容量快照 / returns the total capacity snapshot of the ledger.
    pub fn capacity(&self) -> &ResourceCapacity {
        &self.capacity
    }

    /// tenant_quota 返回指定租户的软上限（如已配置）/ returns the configured soft quota for a tenant, if any.
    pub fn tenant_quota(&self, tenant: &str) -> Option<&ResourceCapacity> {
        self.tenant_quotas.get(tenant)
    }

    /// tenant_quotas_snapshot 返回全部租户配额映射的引用 / returns a reference to the full tenant quota map.
    pub fn tenant_quotas_snapshot(&self) -> &BTreeMap<String, ResourceCapacity> {
        &self.tenant_quotas
    }

    /// ensure_within_capacity 校验单个任务请求本身不超过 runtime 总容量 / validates that one reservation request does not exceed total runtime capacity.
    pub fn ensure_within_capacity(&self, reservation: &TaskResourceReservation) -> AppResult<()> {
        if reservation.task_slots > self.capacity.task_slots {
            return Err(AppError::InsufficientResources(format!(
                "task requires {} task slots but runtime capacity is {}",
                reservation.task_slots, self.capacity.task_slots
            )));
        }

        if let (Some(requested), Some(capacity)) =
            (reservation.memory_bytes, self.capacity.memory_bytes)
        {
            if requested > capacity {
                return Err(AppError::InsufficientResources(format!(
                    "task requires {requested} memory_bytes but runtime capacity is {capacity}"
                )));
            }
        }

        if let (Some(requested), Some(capacity)) = (reservation.pids, self.capacity.pids) {
            if requested > capacity {
                return Err(AppError::InsufficientResources(format!(
                    "task requires {requested} pids but runtime capacity is {capacity}"
                )));
            }
        }

        Ok(())
    }

    /// ensure_within_tenant_quota 校验单个任务不超过其租户软上限 / validates that one reservation does not exceed the tenant's soft quota.
    ///
    /// 若 tenant 为 None 或该租户无配置配额则直接放行 / If tenant is None or no quota is configured for it, the check is skipped.
    pub fn ensure_within_tenant_quota(
        &self,
        tenant: Option<&str>,
        reservation: &TaskResourceReservation,
    ) -> AppResult<()> {
        let quota = match tenant.and_then(|t| self.tenant_quotas.get(t)) {
            Some(q) => q,
            None => return Ok(()),
        };
        let tenant_name = tenant.unwrap_or("");

        if reservation.task_slots > quota.task_slots {
            return Err(AppError::InsufficientResources(format!(
                "tenant '{tenant_name}': task requires {} task slots but tenant quota is {}",
                reservation.task_slots, quota.task_slots
            )));
        }

        if let (Some(requested), Some(limit)) = (reservation.memory_bytes, quota.memory_bytes) {
            if requested > limit {
                return Err(AppError::InsufficientResources(format!(
                    "tenant '{tenant_name}': task requires {requested} memory_bytes but tenant quota is {limit}"
                )));
            }
        }

        if let (Some(requested), Some(limit)) = (reservation.pids, quota.pids) {
            if requested > limit {
                return Err(AppError::InsufficientResources(format!(
                    "tenant '{tenant_name}': task requires {requested} pids but tenant quota is {limit}"
                )));
            }
        }

        Ok(())
    }

    /// can_reserve 判断当前已预留资源上再叠加一个任务是否仍可接受 / reports whether another reservation can be accepted on top of the currently reserved resources.
    pub fn can_reserve(
        &self,
        currently_reserved: &ResourceCapacity,
        reservation: &TaskResourceReservation,
    ) -> bool {
        if currently_reserved
            .task_slots
            .saturating_add(reservation.task_slots)
            > self.capacity.task_slots
        {
            return false;
        }

        if let (Some(reserved), Some(requested), Some(capacity)) = (
            currently_reserved.memory_bytes,
            reservation.memory_bytes,
            self.capacity.memory_bytes,
        ) {
            if reserved.saturating_add(requested) > capacity {
                return false;
            }
        }

        if let (Some(reserved), Some(requested), Some(capacity)) = (
            currently_reserved.pids,
            reservation.pids,
            self.capacity.pids,
        ) {
            if reserved.saturating_add(requested) > capacity {
                return false;
            }
        }

        true
    }

    /// can_reserve_for_tenant 判断在租户已用量之上叠加预留是否在租户配额内 / reports whether adding a reservation stays within the tenant quota.
    ///
    /// 若 tenant 为 None 或无配额配置则始终返回 true / Always returns true if tenant is None or no quota is configured.
    pub fn can_reserve_for_tenant(
        &self,
        tenant: Option<&str>,
        tenant_reserved: &ResourceCapacity,
        reservation: &TaskResourceReservation,
    ) -> bool {
        let quota = match tenant.and_then(|t| self.tenant_quotas.get(t)) {
            Some(q) => q,
            None => return true,
        };

        if tenant_reserved
            .task_slots
            .saturating_add(reservation.task_slots)
            > quota.task_slots
        {
            return false;
        }

        if let (Some(reserved), Some(requested), Some(limit)) = (
            tenant_reserved.memory_bytes,
            reservation.memory_bytes,
            quota.memory_bytes,
        ) {
            if reserved.saturating_add(requested) > limit {
                return false;
            }
        }

        if let (Some(reserved), Some(requested), Some(limit)) =
            (tenant_reserved.pids, reservation.pids, quota.pids)
        {
            if reserved.saturating_add(requested) > limit {
                return false;
            }
        }

        true
    }

    /// reserved_capacity 根据活动预留列表聚合已占用容量 / aggregates the reserved capacity from active reservations.
    pub fn reserved_capacity<'a, I>(&self, reservations: I) -> ResourceCapacity
    where
        I: IntoIterator<Item = &'a TaskResourceReservation>,
    {
        let mut task_slots = 0u64;
        let mut memory = if self.capacity.memory_bytes.is_some() {
            Some(0u64)
        } else {
            None
        };
        let mut pids = if self.capacity.pids.is_some() {
            Some(0u64)
        } else {
            None
        };

        for reservation in reservations {
            task_slots = task_slots.saturating_add(reservation.task_slots);
            if let Some(value) = reservation.memory_bytes {
                let current = memory.unwrap_or(0);
                memory = Some(current.saturating_add(value));
            }
            if let Some(value) = reservation.pids {
                let current = pids.unwrap_or(0);
                pids = Some(current.saturating_add(value));
            }
        }

        ResourceCapacity {
            task_slots,
            memory_bytes: memory,
            pids,
        }
    }

    /// available_capacity 计算当前剩余可分配容量 / computes the currently available capacity.
    pub fn available_capacity(&self, reserved: &ResourceCapacity) -> ResourceCapacity {
        ResourceCapacity {
            task_slots: self.capacity.task_slots.saturating_sub(reserved.task_slots),
            memory_bytes: self
                .capacity
                .memory_bytes
                .map(|capacity| capacity.saturating_sub(reserved.memory_bytes.unwrap_or(0))),
            pids: self
                .capacity
                .pids
                .map(|capacity| capacity.saturating_sub(reserved.pids.unwrap_or(0))),
        }
    }

    /// tenant_available_capacity 计算租户的剩余可分配容量（需已有配额配置）/ computes the available capacity for a tenant given its quota and current reservation.
    pub fn tenant_available_capacity(
        quota: &ResourceCapacity,
        reserved: &ResourceCapacity,
    ) -> ResourceCapacity {
        ResourceCapacity {
            task_slots: quota.task_slots.saturating_sub(reserved.task_slots),
            memory_bytes: quota
                .memory_bytes
                .map(|q| q.saturating_sub(reserved.memory_bytes.unwrap_or(0))),
            pids: quota
                .pids
                .map(|q| q.saturating_sub(reserved.pids.unwrap_or(0))),
        }
    }

    /// empty_snapshot 构造没有活动预留时的资源视图 / builds a resource view with no active reservations.
    pub fn empty_snapshot(&self, runtime_id: String) -> RuntimeResourcesResponse {
        let reserved = self.reserved_capacity(std::iter::empty::<&TaskResourceReservation>());
        RuntimeResourcesResponse {
            runtime_id,
            capacity: self.capacity.clone(),
            available: self.available_capacity(&reserved),
            reserved,
            active_reservations: Vec::new(),
            accepted_waiting_tasks: 0,
            tenants: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_ledger_with_quota() -> ResourceLedger {
        let mut quotas = BTreeMap::new();
        quotas.insert(
            "alice".to_string(),
            ResourceCapacity {
                task_slots: 2,
                memory_bytes: Some(200),
                pids: Some(10),
            },
        );
        ResourceLedger::with_tenant_quotas(
            ResourceCapacity {
                task_slots: 8,
                memory_bytes: Some(800),
                pids: Some(64),
            },
            quotas,
        )
    }

    #[test]
    fn detects_capacity_overflow() {
        let ledger = ResourceLedger::new(ResourceCapacity {
            task_slots: 2,
            memory_bytes: Some(100),
            pids: Some(8),
        });
        let reserved = ResourceCapacity {
            task_slots: 1,
            memory_bytes: Some(50),
            pids: Some(2),
        };
        let reservation = TaskResourceReservation {
            task_slots: 2,
            memory_bytes: Some(60),
            pids: Some(1),
        };
        assert!(!ledger.can_reserve(&reserved, &reservation));
    }

    #[test]
    fn ensure_within_tenant_quota_passes_when_no_quota_configured() {
        let ledger = ResourceLedger::new(ResourceCapacity {
            task_slots: 4,
            memory_bytes: None,
            pids: None,
        });
        let reservation = TaskResourceReservation {
            task_slots: 99,
            memory_bytes: None,
            pids: None,
        };
        // 无配额：始终通过 / no quota: always passes
        assert!(ledger
            .ensure_within_tenant_quota(Some("bob"), &reservation)
            .is_ok());
        assert!(ledger
            .ensure_within_tenant_quota(None, &reservation)
            .is_ok());
    }

    #[test]
    fn ensure_within_tenant_quota_rejects_over_quota() {
        let ledger = make_ledger_with_quota();

        // 超出 task_slots / exceeds task_slots
        let over_slots = TaskResourceReservation {
            task_slots: 3,
            memory_bytes: None,
            pids: None,
        };
        assert!(ledger
            .ensure_within_tenant_quota(Some("alice"), &over_slots)
            .is_err());

        // 超出 memory / exceeds memory
        let over_mem = TaskResourceReservation {
            task_slots: 1,
            memory_bytes: Some(201),
            pids: None,
        };
        assert!(ledger
            .ensure_within_tenant_quota(Some("alice"), &over_mem)
            .is_err());

        // 超出 pids / exceeds pids
        let over_pids = TaskResourceReservation {
            task_slots: 1,
            memory_bytes: None,
            pids: Some(11),
        };
        assert!(ledger
            .ensure_within_tenant_quota(Some("alice"), &over_pids)
            .is_err());
    }

    #[test]
    fn can_reserve_for_tenant_respects_quota() {
        let ledger = make_ledger_with_quota();

        // 已用 1 slot，再加 1 slot = 2，恰好在配额内 / used 1 + request 1 = 2 which is within quota
        let tenant_reserved = ResourceCapacity {
            task_slots: 1,
            memory_bytes: Some(100),
            pids: Some(5),
        };
        let ok_reservation = TaskResourceReservation {
            task_slots: 1,
            memory_bytes: Some(100),
            pids: Some(5),
        };
        assert!(ledger.can_reserve_for_tenant(Some("alice"), &tenant_reserved, &ok_reservation));

        // 已用 1 slot，再加 2 slot = 3，超出配额 / used 1 + request 2 = 3 exceeds quota
        let over_reservation = TaskResourceReservation {
            task_slots: 2,
            memory_bytes: Some(1),
            pids: Some(1),
        };
        assert!(!ledger.can_reserve_for_tenant(Some("alice"), &tenant_reserved, &over_reservation));

        // 无配额租户始终返回 true / no-quota tenant always true
        assert!(ledger.can_reserve_for_tenant(
            Some("unknown"),
            &tenant_reserved,
            &over_reservation
        ));
    }
}
