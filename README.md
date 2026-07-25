\# Mini Content Scheduler



A small service that mimics a real publish pipeline — posts get created, queued, and "published" on schedule, with caching and safe retry behavior.



\## Stack



Node.js / Express + PostgreSQL + Redis (matches the target production stack).



\## Running locally



\*\*Prerequisites:\*\* Docker Desktop, Node.js 18+.



```bash

\# 1. Start Postgres + Redis

docker-compose up -d



\# 2. Install dependencies

npm install



\# 3. Apply the DB schema

npm run migrate



\# 4. Start the API server (leave this running)

npm start



\# 5. In a separate terminal, start the background worker (leave this running too)

npm run worker

```



The API is now live at `http://localhost:3000`.



\### Try it



```bash

\# Create a post (scheduledAt in the past = worker picks it up on its next poll)

curl.exe -X POST localhost:3000/posts -H "Content-Type: application/json" -d "{\\"tenantId\\":\\"11111111-1111-1111-1111-111111111111\\",\\"content\\":\\"hello world\\",\\"platform\\":\\"twitter\\",\\"scheduledAt\\":\\"2026-07-25T00:00:00Z\\"}"



\# Fetch a single post

curl.exe localhost:3000/posts/<id>



\# List a tenant's posts (cached in Redis, 30s TTL)

curl.exe "localhost:3000/posts?tenantId=11111111-1111-1111-1111-111111111111"

```



The worker polls every 5 seconds, picks up any `PENDING` post whose `scheduledAt` has passed, and "publishes" it (mocked — no real social API call, \~5% simulated random failure to exercise the `FAILED` path).



\## API surface



| Method | Route | Description |

|---|---|---|

| POST | `/posts` | Create a post: `{ tenantId, content, platform, scheduledAt }` |

| GET | `/posts/:id` | Fetch a single post and its status |

| GET | `/posts?tenantId=` | List a tenant's posts (cached) |



Status lifecycle: `PENDING → QUEUED → PUBLISHED / FAILED`



\## Key design decisions



\*\*Idempotency — atomic claim, not read-then-write.\*\*

The naive approach (`SELECT` due posts, then `UPDATE` each one) has a race: two worker instances, or a retried job, can both read a post as `PENDING` before either writes back, and both publish it. Instead, claiming a post is a single conditional `UPDATE`:



```sql

UPDATE posts SET status = 'QUEUED', locked\_at = NOW()

WHERE id = $1 AND status = 'PENDING'

RETURNING \*;

```



The `WHERE status = 'PENDING'` and the write happen in the same statement, so Postgres's row lock makes the check-and-set atomic. If another process already claimed the row, this returns zero rows and the worker just skips it — no error, no double publish. The same pattern gates the `QUEUED → PUBLISHED` and `QUEUED → FAILED` transitions.



\*\*Cache invalidation — delete-on-write, not TTL alone.\*\*

`GET /posts?tenantId=` is cached in Redis with a 30s TTL, but TTL alone would let a client see stale data for up to 30s right after creating a post. Instead, both the create endpoint and the worker (on every status change) explicitly `DEL` that tenant's cache key. TTL is only a safety net for cache keys that are never explicitly touched again.



\*\*Multi-tenancy.\*\*

Every query is scoped by `tenant\_id` at the SQL level, and cache keys are namespaced per tenant (`posts:tenant:<id>`), so there's no path where one tenant's cached list could leak into another's response.



\*\*Polling worker vs. a real queue (BullMQ).\*\*

Went with a simple `setInterval` poll against Postgres rather than BullMQ, to keep the moving parts minimal and the idempotency logic easy to reason about and verify directly against the DB. It's guarded against overlapping ticks (a tick that runs long won't start a second one on top of itself). The tradeoff: fixed 5s latency on pickup, and no built-in retry/backoff — a real BullMQ-based version would remove the poll delay and add automatic retries with backoff, at the cost of an extra moving part (Redis-backed job queue) to reason about.



\## What I'd do differently with more time



\- Swap the polling worker for BullMQ + Redis, with automatic retry/backoff on failed publishes instead of leaving them permanently `FAILED`.

\- Add integration tests that specifically exercise the race condition (fire concurrent claims at the same post ID, assert only one succeeds).

\- Structured logging instead of `console.log`, and a `/metrics` endpoint.

\- Pagination on `GET /posts?tenantId=` — currently returns the full list.



\## AI tool usage



\[Fill in honestly: which parts you used Claude for vs. wrote/adjusted yourself — e.g. "used Claude to scaffold the initial project structure and the atomic-claim SQL pattern; wrote the route handlers and debugged the Windows/Docker/WSL setup myself."]

