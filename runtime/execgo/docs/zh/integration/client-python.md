# Python（HTTP）接入示例

本示例使用 Python 通过 HTTP 接入 ExecGo：

- `POST /tasks` 提交 `TaskGraph`
- `GET /tasks/{id}` 轮询任务状态
- 读取 `result` / `error`

示例使用内置 `noop` 执行器（无外部 IO），便于你在本地验证。

## 前置

建议安装 `requests`：

```bash
pip install requests
```

## 代码：最小可运行脚本

```python
import os
import time
import requests

base_url = os.getenv("EXECGO_URL", "http://localhost:8080")

graph = {
    "tasks": [
        {
            "id": "t1",
            "type": "noop",
            "params": {"message": "hello"},
            "retry": 0,
            "timeout": 0
        },
        {
            "id": "t2",
            "type": "noop",
            "params": {"message": "after t1"},
            "depends_on": ["t1"],
            "retry": 0,
            "timeout": 0
        }
    ]
}

# 1) submit
resp = requests.post(base_url + "/tasks", json=graph, timeout=30)
if resp.status_code != 202:
    raise RuntimeError(f"submit failed: status={resp.status_code} body={resp.text}")

submit = resp.json()
task_ids = submit["task_ids"]
print("accepted task_ids:", task_ids)

def poll_task(task_id: str):
    interval = 0.5
    max_interval = 5.0

    while True:
        r = requests.get(base_url + f"/tasks/{task_id}", timeout=30)
        r.raise_for_status()
        st = r.json()
        status = st["status"]

        if status == "success":
            print(f"task {task_id} success: {st.get('result')}")
            return
        if status == "failed":
            print(f"task {task_id} failed: {st.get('error')}")
            return
        if status == "skipped":
            print(f"task {task_id} skipped: {st.get('error')}")
            return

        time.sleep(interval)
        interval = min(max_interval, interval * 1.5)

# 2) poll
for tid in task_ids:
    poll_task(tid)
```

## 运行

```bash
python client-python.py
```

