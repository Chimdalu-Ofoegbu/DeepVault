// indexer/src/cursor.ts — Atomic JSON cursor persistence.
//
// Source: 04-RESEARCH.md Pattern 2 (verbatim).
//
// Per-stream cursor file at `indexer/data/cursor_<stream>.json`. Each
// poll-loop persists ON EVERY EVENT (NOT per page) to mitigate Pitfall 6
// (Render ephemeral filesystem + cursor non-durability). Cold-boot fallback
// is graceful: ENOENT → cursor=null → backfill last ~1h via the relay's
// 1h-or-100-event ring buffer.
//
// Atomicity via tmp+rename: `fs.rename` is atomic on both POSIX and NTFS,
// so a crash mid-write can never leave a half-written cursor file.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export class Cursor<T> {
  private _value: T | null = null;

  constructor(
    private readonly filePath: string,
    private readonly initial: T | null = null,
  ) {}

  /**
   * Read the persisted value from disk. Missing file → returns the
   * constructor `initial` value (null by default). Any other I/O error
   * propagates so the caller can fail loudly rather than silently restart
   * from scratch.
   */
  async load(): Promise<T | null> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      this._value = JSON.parse(raw) as T;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        this._value = this.initial;
      } else {
        throw e;
      }
    }
    return this._value;
  }

  get value(): T | null {
    return this._value;
  }

  /**
   * Persist atomically: write to `<filePath>.tmp`, then rename. Concurrent
   * writers race the rename but never corrupt the file (the OS guarantees
   * the rename is all-or-nothing).
   */
  async set(v: T): Promise<void> {
    this._value = v;
    const tmp = this.filePath + '.tmp';
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(v), 'utf-8');
    await fs.rename(tmp, this.filePath);
  }
}
