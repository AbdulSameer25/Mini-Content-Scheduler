import { Router } from 'express';
import { createPost, getPostById, listPostsByTenant } from '../db/posts.js';
import { redis, tenantListKey, TTL_SECONDS } from '../cache/redis.js';

export const router = Router();

router.post('/posts', async (req, res) => {
  const { tenantId, content, platform, scheduledAt } = req.body;
  if (!tenantId || !content || !platform || !scheduledAt) {
    return res.status(400).json({ error: 'tenantId, content, platform, scheduledAt are required' });
  }

  const post = await createPost({ tenantId, content, platform, scheduledAt });

  // Invalidate this tenant's cached list — delete, don't try to patch it in place.
  // Simpler and avoids ever serving a half-updated cached value.
  await redis.del(tenantListKey(tenantId));

  res.status(201).json(post);
});

router.get('/posts/:id', async (req, res) => {
  const post = await getPostById(req.params.id);
  if (!post) return res.status(404).json({ error: 'not found' });
  res.json(post);
});

router.get('/posts', async (req, res) => {
  const { tenantId } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'tenantId query param is required' });

  const key = tenantListKey(tenantId);
  const cached = await redis.get(key);
  if (cached) {
    return res.json({ source: 'cache', posts: JSON.parse(cached) });
  }

  const posts = await listPostsByTenant(tenantId);
  await redis.set(key, JSON.stringify(posts), 'EX', TTL_SECONDS);
  res.json({ source: 'db', posts });
});
