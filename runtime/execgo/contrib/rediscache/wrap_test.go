package rediscache

import (
	"encoding/json"
	"log/slog"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/iammm0/execgo/pkg/models"
	"github.com/iammm0/execgo/pkg/store/jsonfile"
	"github.com/redis/go-redis/v9"
)

func setup(t *testing.T) (*cachedStore, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	underlying, err := jsonfile.NewManager(t.TempDir(), slog.Default())
	if err != nil {
		t.Fatal(err)
	}
	cs := Wrap(underlying, rdb, Options{TTL: time.Minute}).(*cachedStore)
	return cs, mr
}

func TestGetCachesOnMiss(t *testing.T) {
	cs, mr := setup(t)
	task := &models.Task{ID: "t1", Status: models.StatusPending}
	cs.u.Put(task)

	got, ok := cs.Get("t1")
	if !ok || got.ID != "t1" {
		t.Fatal("expected task from underlying")
	}
	if !mr.Exists(cs.cacheKey("t1")) {
		t.Fatal("expected cache entry after Get")
	}
}

func TestGetServesFromCache(t *testing.T) {
	cs, mr := setup(t)
	task := &models.Task{ID: "t2", Status: models.StatusRunning}
	data, _ := json.Marshal(task)
	mr.Set(cs.cacheKey("t2"), string(data))

	got, ok := cs.Get("t2")
	if !ok || got.Status != models.StatusRunning {
		t.Fatal("expected task from cache")
	}
}

func TestPutInvalidatesCache(t *testing.T) {
	cs, mr := setup(t)
	mr.Set(cs.cacheKey("t3"), `{"id":"t3"}`)

	cs.Put(&models.Task{ID: "t3", Status: models.StatusSuccess})
	if mr.Exists(cs.cacheKey("t3")) {
		t.Fatal("expected cache invalidation after Put")
	}
}

func TestDeleteInvalidatesCache(t *testing.T) {
	cs, mr := setup(t)
	cs.Put(&models.Task{ID: "t4", Status: models.StatusPending})
	// populate cache
	cs.Get("t4")
	if !mr.Exists(cs.cacheKey("t4")) {
		t.Fatal("precondition: cache should exist")
	}

	cs.Delete("t4")
	if mr.Exists(cs.cacheKey("t4")) {
		t.Fatal("expected cache invalidation after Delete")
	}
}

func TestUpdateStatusInvalidatesCache(t *testing.T) {
	cs, mr := setup(t)
	cs.Put(&models.Task{ID: "t5", Status: models.StatusPending})
	cs.Get("t5") // populate cache

	cs.UpdateStatus("t5", models.StatusSuccess, nil, "")
	if mr.Exists(cs.cacheKey("t5")) {
		t.Fatal("expected cache invalidation after UpdateStatus")
	}
}

func TestGetAllBypassesCache(t *testing.T) {
	cs, _ := setup(t)
	cs.Put(&models.Task{ID: "t6", Status: models.StatusPending})
	cs.Put(&models.Task{ID: "t7", Status: models.StatusRunning})

	all := cs.GetAll()
	if len(all) != 2 {
		t.Fatalf("expected 2 tasks, got %d", len(all))
	}
}
