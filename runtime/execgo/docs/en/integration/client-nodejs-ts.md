# Node.js + TypeScript (HTTP) Integration Example

This example shows how to integrate with ExecGo from a Node.js + TypeScript app:

1. `POST /tasks` to submit a `TaskGraph`
2. read `task_ids`
3. poll `GET /tasks/{id}` until `success/failed/skipped`

It uses the built-in `noop` executor (no external I/O), so it's easy to run locally.

## Prerequisites

- Node.js 18+ (built-in `fetch`)
- A TypeScript project (or run with `tsx`/`ts-node`)

## Example code (`client-nodejs-ts.ts`)

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

## Run

For example with `tsx`:

```bash
npm i -D tsx typescript @types/node
npx tsx client-nodejs-ts.ts
```

---

## Supplement：Axios-based client

If your project prefers `axios`, you can implement submit & poll similarly (still using the built-in `noop` executor for easy verification).

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

Install dependency:

```bash
npm i axios
```

---

## Supplement：NestJS service wrapper (HTTP)

If you are building a NestJS project, wrap ExecGo HTTP calls into a Service.

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

Install dependencies (choose versions to match your Nest setup):

```bash
npm i @nestjs/axios axios rxjs
```

And register `HttpModule` in your `AppModule` (most Nest projects already have it).

---

## Supplement：Full project skeleton (copy & paste)

Here is a minimal project skeleton:

```text
execgo-ts-client/
  package.json
  tsconfig.json
  src/
    index.ts
```

`package.json` example:

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

`tsconfig.json` example:

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

Put the `fetch` version submit & poll code into `src/index.ts`, then:

```bash
npm i
npm run start
```

At runtime:

- set `EXECGO_URL=http://localhost:8080` (or change baseURL in code)
- make sure ExecGo is running and `/health` returns `ok`
