import { findDuePosts, claimPost, markPublished, markFailed } from '../db/posts.js';
import { redis, tenantListKey } from '../cache/redis.js';

const POLL_INTERVAL_MS = 5000;

async function mockPublish(post) {
  // Real integration would call the platform's API here.
  // Simulate occasional failure to exercise the FAILED path.
  const willFail = Math.random() < 0.05;
  await new Promise((r) => setTimeout(r, 100));
  if (willFail) throw new Error('simulated platform API error');
  return true;
}

let ticking = false;

async function tick() {
  if (ticking) return; // previous tick still running, skip this interval
  ticking = true;
  try {
    await runTick();
  } finally {
    ticking = false;
  }
}

async function runTick() {
  const candidates = await findDuePosts(20);

  for (const { id } of candidates) {
    const claimed = await claimPost(id);
    if (!claimed) {
      // Lost the race to another worker instance — not an error, just skip.
      console.log(`[worker] skip ${id}, already claimed`);
      continue;
    }

    console.log(`[worker] publishing ${id}`);
    try {
      await mockPublish(claimed);
      await markPublished(id);
      console.log(`[worker] published ${id}`);
    } catch (err) {
      await markFailed(id, err.message);
      console.log(`[worker] failed ${id}: ${err.message}`);
    }

    // Status changed → tenant's list view is stale now → invalidate.
    await redis.del(tenantListKey(claimed.tenant_id));
  }
}

console.log('[worker] starting, polling every', POLL_INTERVAL_MS, 'ms');
setInterval(tick, POLL_INTERVAL_MS);
tick(); // run once immediately on boot
