export const TASK_ACTIVITY_EVENT = 'secbot-task-activity'

export type TaskActivityDetail = {
  busy: boolean
  phase?: string
  sessionId?: string
}

let current: TaskActivityDetail = { busy: false }

export function getTaskActivity(): TaskActivityDetail {
  return current
}

export function setTaskActivity(detail: TaskActivityDetail) {
  current = {
    busy: Boolean(detail.busy),
    phase: detail.phase,
    sessionId: detail.sessionId,
  }
  window.dispatchEvent(new CustomEvent(TASK_ACTIVITY_EVENT, { detail: current }))
}
