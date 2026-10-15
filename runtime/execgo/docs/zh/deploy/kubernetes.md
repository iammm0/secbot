# Kubernetes 部署示范

本页给出一个可运行的最小 Kubernetes 部署方案：`Deployment + Service`，并通过 PVC 把容器内的 `/data` 挂载出来，保证任务状态在 Pod 重启后仍可恢复。

> 重要提示：默认 ExecGo 使用 JSON 文件存储（`pkg/store/jsonfile`），不提供分布式一致性。若你把同一个数据卷挂到多个副本，可能出现状态覆盖/竞态。

## 1. 镜像准备

确保你已经构建并推送了镜像，例如：

```bash
docker build -t your-registry/execgo:0.1 .
docker push your-registry/execgo:0.1
```

后续 YAML 中的 `image:` 请替换为你的镜像。

## 2. 持久化卷（PVC）

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: execgo-data
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: your-storage-class
  resources:
    requests:
      storage: 1Gi
```

`ReadWriteOnce` 是推荐值（避免多个 Pod 同时写同一份 `state.json`）。

## 3. Deployment + Service

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: execgo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: execgo
  template:
    metadata:
      labels:
        app: execgo
    spec:
      containers:
        - name: execgo
          image: your-registry/execgo:0.1
          ports:
            - name: http
              containerPort: 8080
            - name: grpc
              containerPort: 50051
          env:
            - name: EXECGO_ADDR
              value: ":8080"
            - name: EXECGO_GRPC_ADDR
              value: ":50051"
            - name: EXECGO_DATA_DIR
              value: "/data"
            - name: EXECGO_MAX_CONCURRENCY
              value: "10"
            - name: EXECGO_SHUTDOWN_TIMEOUT
              value: "15"
          volumeMounts:
            - name: data
              mountPath: /data
          readinessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 2
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: execgo-data
---
apiVersion: v1
kind: Service
metadata:
  name: execgo
spec:
  selector:
    app: execgo
  ports:
    - name: http
      port: 8080
      targetPort: http
    - name: grpc
      port: 50051
      targetPort: grpc
```

## 4. 部署与验证

```bash
kubectl apply -f .

kubectl get pods -l app=execgo

# 方式一：kubectl port-forward
kubectl port-forward svc/execgo 8080:8080
curl http://localhost:8080/health
```

## 5. 多副本注意事项（必须看）

- 默认 JSON 文件存储不提供分布式锁
- `replicas > 1` + 共享同一个 PVC 的写入，可能导致 `state.json` 被覆盖

推荐做法：

- 将 `replicas` 维持为 `1`（最稳妥）
- 若你必须横向扩展：
  - 为每个副本配置独立的数据卷（通常需要 StatefulSet + 每 Pod 一份 PVC），或
  - 采用更适合并发写的存储实现（例如 SQLite 模块需要在镜像/运行时侧启用）

