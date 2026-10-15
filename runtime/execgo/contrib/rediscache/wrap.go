// Package rediscache 提供基于 Redis 的 store.Store 读穿缓存装饰器 / Redis read-through cache decorator for store.Store.
// Author: iammm0; Last edited: 2026-04-23
package rediscache

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/iammm0/execgo/pkg/models"
	"github.com/iammm0/execgo/pkg/store"

	"github.com/redis/go-redis/v9"
)

// Options 缓存键前缀与 TTL / key prefix and TTL for cached entries.
type Options struct {
	KeyPrefix string
	TTL       time.Duration
}

type cachedStore struct {
	u    store.Store
	rdb  *redis.Client
	opts Options
}

// Wrap 在 underlying 之上增加按任务 id 的读穿缓存；GetAll 始终直读 underlying / read-through cache per task id; GetAll bypasses Redis.
func Wrap(underlying store.Store, rdb *redis.Client, opts Options) store.Store {
	if opts.KeyPrefix == "" {
		opts.KeyPrefix = "execgo:task:"
	}
	if opts.TTL <= 0 {
		opts.TTL = time.Minute * 5
	}
	return &cachedStore{u: underlying, rdb: rdb, opts: opts}
}

func (c *cachedStore) cacheKey(id string) string {
	return c.opts.KeyPrefix + id
}

func (c *cachedStore) Get(id string) (*models.Task, bool) {
	ctx := context.Background()
	data, err := c.rdb.Get(ctx, c.cacheKey(id)).Bytes()
	if err == nil {
		var t models.Task
		if json.Unmarshal(data, &t) == nil {
			return &t, true
		}
	} else if !errors.Is(err, redis.Nil) {
		// Redis 异常时降级直读 / degrade to underlying on Redis errors
	}

	t, ok := c.u.Get(id)
	if !ok {
		return nil, false
	}
	if b, err := json.Marshal(t); err == nil {
		_ = c.rdb.Set(ctx, c.cacheKey(id), b, c.opts.TTL).Err()
	}
	return t, true
}

func (c *cachedStore) GetAll() []*models.Task {
	return c.u.GetAll()
}

func (c *cachedStore) Put(task *models.Task) {
	c.u.Put(task)
	ctx := context.Background()
	_ = c.rdb.Del(ctx, c.cacheKey(task.ID)).Err()
}

func (c *cachedStore) Delete(id string) bool {
	ok := c.u.Delete(id)
	ctx := context.Background()
	_ = c.rdb.Del(ctx, c.cacheKey(id)).Err()
	return ok
}

func (c *cachedStore) UpdateStatus(id string, status models.TaskStatus, result json.RawMessage, errMsg string) bool {
	ok := c.u.UpdateStatus(id, status, result, errMsg)
	ctx := context.Background()
	_ = c.rdb.Del(ctx, c.cacheKey(id)).Err()
	return ok
}
