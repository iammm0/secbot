# Kubernetes Deployment Example

This page provides a minimal, runnable Kubernetes setup using `Deployment + Service`.
It mounts `/data` from a PVC so task state can survive Pod restarts.

> Important: By default, ExecGo uses JSON-file storage (`pkg/store/jsonfile`). It does not provide distributed consistency.
If multiple Pods share the same volume, you may get state overwrites/races.

## 1) Build and push the image

Make sure you have pushed an image, for example:

```bash
docker build -t your-registry/execgo:0.1 .
docker push your-registry/execgo:0.1
```

Replace `image:` in the YAML with your own registry reference.

## 2) Persistent Volume Claim (PVC)

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

`ReadWriteOnce` is recommended to avoid multiple Pods writing the same `state.json`.

## 3) Deployment + Service

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

## 4) Apply and verify

```bash
kubectl apply -f .

kubectl get pods -l app=execgo

# Port-forward to test locally
kubectl port-forward svc/execgo 8080:8080
curl http://localhost:8080/health
```

## 5) Replica safety (must read)

- JSON file storage does not provide distributed locks
- `replicas > 1` with a shared PVC volume may cause `state.json` overwrites

Recommended approaches:

- keep `replicas: 1` for the default image
- if you must scale:
  - allocate independent per-Pod storage (often via StatefulSet + PVC per Pod), or
  - enable a storage module better suited for concurrent writes

