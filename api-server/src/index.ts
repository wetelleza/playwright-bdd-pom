import express, { type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { taskStore } from './store';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

// Demo-only hardcoded credentials — this is a mock service for testing practice, not a real
// user system. A real backend would check against a users table with hashed passwords.
const DEMO_USERNAME = 'admin';
const DEMO_PASSWORD = 'admin123';
const validTokens = new Set<string>();

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  if (username !== DEMO_USERNAME || password !== DEMO_PASSWORD) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = randomUUID();
  validTokens.add(token);
  res.status(200).json({ token });
});

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token || !validTokens.has(token)) {
    return res.status(401).json({ error: 'Missing or invalid bearer token' });
  }
  next();
}

app.use('/tasks', requireAuth);

app.get('/tasks', (_req, res) => {
  res.status(200).json(taskStore.list());
});

app.post('/tasks', (req: Request, res: Response) => {
  const { title } = req.body ?? {};
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: '"title" is required' });
  }
  res.status(201).json(taskStore.create(title));
});

app.get('/tasks/:id', (req: Request, res: Response) => {
  const task = taskStore.get(Number(req.params.id));
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.status(200).json(task);
});

app.put('/tasks/:id', (req: Request, res: Response) => {
  const { title, done } = req.body ?? {};
  const updated = taskStore.update(Number(req.params.id), { title, done });
  if (!updated) return res.status(404).json({ error: 'Task not found' });
  res.status(200).json(updated);
});

app.delete('/tasks/:id', (req: Request, res: Response) => {
  const deleted = taskStore.delete(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: 'Task not found' });
  res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
