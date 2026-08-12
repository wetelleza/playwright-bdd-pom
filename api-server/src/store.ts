export interface Task {
  id: number;
  title: string;
  done: boolean;
}

/**
 * In-memory store: resets whenever the process restarts. That's fine for a test target — the
 * API test suite always starts from a login, and doesn't depend on data surviving a restart.
 * The extension point when that stops being true is swapping this file for a real DB (SQLite/
 * Postgres), without the routes in index.ts needing to change shape.
 */
class TaskStore {
  private tasks = new Map<number, Task>();
  private nextId = 1;

  list(): Task[] {
    return [...this.tasks.values()];
  }

  get(id: number): Task | undefined {
    return this.tasks.get(id);
  }

  create(title: string): Task {
    const task: Task = { id: this.nextId++, title, done: false };
    this.tasks.set(task.id, task);
    return task;
  }

  update(id: number, patch: Partial<Pick<Task, 'title' | 'done'>>): Task | undefined {
    const existing = this.tasks.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch };
    this.tasks.set(id, updated);
    return updated;
  }

  delete(id: number): boolean {
    return this.tasks.delete(id);
  }
}

export const taskStore = new TaskStore();
