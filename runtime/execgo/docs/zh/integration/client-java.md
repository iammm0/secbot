# Java（HTTP）接入示例

本示例使用 Java `HttpClient` 通过 HTTP 接入 ExecGo：

- `POST /tasks` 提交 `TaskGraph`
- 读取 `task_ids`
- 轮询 `GET /tasks/{id}` 获取 `status/result/error`

示例同样使用内置 `noop` 执行器（无外部 IO），便于你在本地直接验证整条链路。

## 前置：使用 Jackson 解析 JSON（推荐）

你可以在 `pom.xml` 引入 Jackson（版本按你的项目选择即可）：

```xml
<dependency>
  <groupId>com.fasterxml.jackson.core</groupId>
  <artifactId>jackson-databind</artifactId>
  <version><!-- choose your version --></version>
</dependency>
```

## 代码：最小可运行客户端

```java
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

public class Main {
  static class Task {
    public String id;
    public String type;
    public Map<String, Object> params;
    public List<String> depends_on;
    public Integer retry;
    public Long timeout; // milliseconds
  }

  static class TaskGraph {
    public List<Task> tasks;
  }

  static class SubmitResponse {
    public int accepted;
    public List<String> task_ids;
  }

  static class TaskState {
    public String id;
    public String status;
    public JsonNode result;
    public String error;
  }

  public static void main(String[] args) throws Exception {
    String baseURL = System.getenv().getOrDefault("EXECGO_URL", "http://localhost:8080");
    ObjectMapper om = new ObjectMapper();
    HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .build();

    TaskGraph graph = new TaskGraph();
    graph.tasks = List.of(
        task("t1", "noop", Map.of("message", "hello"), List.of(), 0, 0L),
        task("t2", "noop", Map.of("message", "after t1"), List.of("t1"), 0, 0L)
    );

    // 1) submit
    String json = om.writeValueAsString(graph);
    HttpRequest post = HttpRequest.newBuilder(URI.create(baseURL + "/tasks"))
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(json))
        .build();

    HttpResponse<String> postResp = client.send(post, HttpResponse.BodyHandlers.ofString());
    if (postResp.statusCode() != 202) {
      throw new RuntimeException("submit failed: status=" + postResp.statusCode() + " body=" + postResp.body());
    }

    SubmitResponse submit = om.readValue(postResp.body(), SubmitResponse.class);
    System.out.println("accepted task_ids: " + submit.task_ids);

    // 2) poll
    for (String id : submit.task_ids) {
      pollTask(client, om, baseURL, id);
    }
  }

  static Task task(String id, String type, Map<String, Object> params, List<String> dependsOn, int retry, long timeout) {
    Task t = new Task();
    t.id = id;
    t.type = type;
    t.params = params;
    t.depends_on = dependsOn;
    t.retry = retry;
    t.timeout = timeout;
    return t;
  }

  static void pollTask(HttpClient client, ObjectMapper om, String baseURL, String id) throws Exception {
    long intervalMs = 500;
    long maxMs = 5000;

    while (true) {
      HttpRequest get = HttpRequest.newBuilder(URI.create(baseURL + "/tasks/" + id))
          .GET()
          .build();

      HttpResponse<String> resp = client.send(get, HttpResponse.BodyHandlers.ofString());
      if (resp.statusCode() != 200) {
        throw new RuntimeException("poll failed: status=" + resp.statusCode() + " body=" + resp.body());
      }

      TaskState st = om.readValue(resp.body(), TaskState.class);

      switch (st.status) {
        case "success":
          System.out.println("task " + id + " success: " + st.result);
          return;
        case "failed":
          System.out.println("task " + id + " failed: " + st.error);
          return;
        case "skipped":
          System.out.println("task " + id + " skipped: " + st.error);
          return;
        default:
          // pending/running
      }

      Thread.sleep(intervalMs);
      intervalMs = Math.min(maxMs, (long)(intervalMs * 1.5));
    }
  }
}
```

## 运行

确保 ExecGo 已在 `localhost:8080`（或设置 `EXECGO_URL`）。

