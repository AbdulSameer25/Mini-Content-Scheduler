import express from 'express';
import { router as postsRouter } from './routes/posts.js';

const app = express();
app.use(express.json());
app.use(postsRouter);

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
