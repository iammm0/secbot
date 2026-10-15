# Node.js + TypeScript（HTTP）接入示例

本示例演示在 Node.js + TypeScript 项目中通过 HTTP 接入 ExecGo：

1. `POST /tasks` 提交 `TaskGraph`
2. 读取 `task_ids`
3. 轮询 `GET /tasks/{id}` 直到 `success/failed/skipped`

示例使用内置 `noop` 执行器（无外部 IO），适合本地快速联调。

## 前置条件

- Node.js 18+（内置 `fetch`）
- TypeScript 项目（或可用 `tsx`/`ts-node` 直接运行）

## 代码示例（`client-nodejs-ts.ts`）

```ts
type Task = {
  id: string;
  type: string;
  params?: Record<string, unknown>;
  depends_on?: string[];
  retry?: number;
  timeout?: number; // milliseconds
};

type TaskGraph = { tasks: Task[] };

type SubmitResponse = {
  accepted: number;
  task_ids: string[];
};

type TaskState = {
  id: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  result?: unknown;
  error?: string;
};

const baseURL = process.env.EXECGO_URL ?? "http://localhost:8080";

async function submitGraph(graph: TaskGraph): Promise<SubmitResponse> {
  const resp = await fetch(`${baseURL}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(graph),
  });

  const text = await resp.text();
  if (resp.status !== 202) {
    throw new Error(`submit failed: status=${resp.status} body=${text}`);
  }
  return JSON.parse(text) as SubmitResponse;
}

async function getTask(taskId: string): Promise<TaskState> {
  const resp = await fetch(`${baseURL}/tasks/${encodeURIComponent(taskId)}`);
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`get task failed: status=${resp.status} body=${text}`);
  }
  return JSON.parse(text) as TaskState;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollTask(taskId: string): Promise<TaskState> {
  let interval = 500;
  const maxInterval = 5000;

  while (true) {
    const st = await getTask(taskId);
    if (st.status === "success" || st.status === "failed" || st.status === "skipped") {
      return st;
    }

    await sleep(interval);
    interval = Math.min(maxInterval, Math.floor(interval * 1.5));
  }
}

async function main() {
  const graph: TaskGraph = {
    tasks: [
      {
        id: "t1",
        type: "noop",
        params: { message: "hello from ts" },
        retry: 0,
        timeout: 0,
      },
      {
        id: "t2",
        type: "noop",
        params: { message: "after t1" },
        depends_on: ["t1"],
        retry: 0,
        timeout: 0,
      },
    ],
  };

  const submit = await submitGraph(graph);
  console.log("accepted task_ids:", submit.task_ids);

  for (const id of submit.task_ids) {
    const st = await pollTask(id);
    console.log(`task ${id} -> ${st.status}`, st.result ?? st.error ?? "");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

## 运行方式

例如使用 `tsx`：

```bash
npm i -D tsx typescript @types/node
npx tsx client-nodejs-ts.ts
```

---

## 补充：Axios 版本客户端

如果你的项目习惯使用 `axios`，可以按下面方式实现提交与轮询（仍然使用 `noop` 方便验证）。

```ts
import axios from "axios";

type Task = {
  id: string;
  type: string;
  params?: Record<string, unknown>;
  depends_on?: string[];
  retry?: number;
  timeout?: number; // milliseconds
};

type TaskGraph = { tasks: Task[] };

type SubmitResponse = {
  accepted: number;
  task_ids: string[];
};

type TaskState = {
  id: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  result?: unknown;
  error?: string;
};

const baseURL = process.env.EXECGO_URL ?? "http://localhost:8080";
const http = axios.create({ baseURL });

async function submitGraph(graph: TaskGraph): Promise<SubmitResponse> {
  const resp = await http.post("/tasks", graph, { headers: { "Content-Type": "application/json" } });
  if (resp.status !== 202) throw new Error(`submit failed: status=${resp.status} body=${JSON.stringify(resp.data)}`);
  return resp.data as SubmitResponse;
}

async function getTask(taskId: string): Promise<TaskState> {
  const resp = await http.get(`/tasks/${encodeURIComponent(taskId)}`);
  return resp.data as TaskState;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollTask(taskId: string): Promise<TaskState> {
  let interval = 500;
  const maxInterval = 5000;

  while (true) {
    const st = await getTask(taskId);
    if (st.status === "success" || st.status === "failed" || st.status === "skipped") return st;
    await sleep(interval);
    interval = Math.min(maxInterval, Math.floor(interval * 1.5));
  }
}

async function main() {
  const graph: TaskGraph = {
    tasks: [
      { id: "t1", type: "noop", params: { message: "hello from axios" }, retry: 0, timeout: 0 },
      { id: "t2", type: "noop", params: { message: "after t1" }, depends_on: ["t1"], retry: 0, timeout: 0 },
    ],
  };

  const submit = await submitGraph(graph);
  console.log("accepted task_ids:", submit.task_ids);

  for (const id of submit.task_ids) {
    const st = await pollTask(id);
    console.log(`task ${id} -> ${st.status}`, st.result ?? st.error ?? "");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

安装依赖：

```bash
npm i axios
```

---

## 补充：NestJS Service 封装（HTTP）

如果你是 NestJS 项目，可以把 ExecGo HTTP 调用封装成一个 Service，供控制器或其它 Provider 使用。

```ts
import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

type TaskGraph = { tasks: any[] };
type SubmitResponse = { accepted: number; task_ids: string[] };
type TaskState = { id: string; status: string; result?: unknown; error?: string };

@Injectable()
export class ExecGoClientService {
  constructor(private readonly http: HttpService) {}

  private get baseURL() {
    return process.env.EXECGO_URL ?? "http://localhost:8080";
  }

  async submit(graph: TaskGraph): Promise<SubmitResponse> {
    const resp = await firstValueFrom(
      this.http.post(`${this.baseURL}/tasks`, graph, { headers: { "Content-Type": "application/json" } })
    );

    if (resp.status !== 202) {
      throw new Error(`submit failed: status=${resp.status} body=${JSON.stringify(resp.data)}`);
    }
    return resp.data as SubmitResponse;
  }

  async poll(taskId: string, maxSeconds = 60): Promise<TaskState> {
    let interval = 500;
    const maxInterval = 5000;
    const deadline = Date.now() + maxSeconds * 1000;

    while (Date.now() < deadline) {
      const resp = await firstValueFrom(this.http.get(`${this.baseURL}/tasks/${encodeURIComponent(taskId)}`));
      const st = resp.data as TaskState;

      if (st.status === "success" || st.status === "failed" || st.status === "skipped") return st;

      await new Promise((r) => setTimeout(r, interval));
      interval = Math.min(maxInterval, Math.floor(interval * 1.5));
    }

    throw new Error(`poll timeout: taskId=${taskId}`);
  }
}
```

依赖安装（按你的 Nest 版本选择）：

```bash
npm i @nestjs/axios axios rxjs
```

并在 `AppModule` 里引入 `HttpModule`（你项目里一般已经有）。

---

## 补充：完整项目骨架（可照抄）

下面给出一个非常小的项目结构，包含 `package.json`、`tsconfig.json` 和 `src/index.ts`：

```text
execgo-ts-client/
  package.json
  tsconfig.json
  src/
    index.ts
```

`package.json` 示例：

```json
{
  "name": "execgo-ts-client",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  },
  "dependencies": {}
}
```

`tsconfig.json` 示例（最小可用）：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true
  }
}
```

`src/index.ts` 里直接放你上面 `fetch` 版本的提交与轮询代码即可，然后：

```bash
npm i
npm run start
```

运行时请确保：

- 设置 `EXECGO_URL=http://localhost:8080`（或修改代码的 baseURL）
- ExecGo 服务已经在对端启动（`/health` 返回 ok）
