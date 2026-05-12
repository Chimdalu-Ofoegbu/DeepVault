// cursor.test.ts — atomic write semantics + ENOENT/initial fallback.
//
// All test files live under os.tmpdir() with a unique-per-run suffix so
// parallel test workers never clobber each other and the repo working tree
// is never written to.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cursor } from '../cursor';

type EventCursor = { txDigest: string; eventSeq: string } | null;

let workDir: string;

beforeEach(async () => {
  const stamp = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  workDir = join(tmpdir(), 'deepvault-cursor-' + stamp);
  await fs.mkdir(workDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

describe('Cursor', () => {
  it('load() returns the initial value (null by default) when the file does not exist', async () => {
    const c = new Cursor<EventCursor>(join(workDir, 'cursor.json'));
    const v = await c.load();
    expect(v).toBeNull();
    expect(c.value).toBeNull();
  });

  it('load() returns the constructor initial value when file is missing', async () => {
    const seed: EventCursor = { txDigest: 'seed', eventSeq: '0' };
    const c = new Cursor<EventCursor>(join(workDir, 'cursor.json'), seed);
    const v = await c.load();
    expect(v).toEqual(seed);
    expect(c.value).toEqual(seed);
  });

  it('set() writes JSON atomically and persists across a fresh load()', async () => {
    const filePath = join(workDir, 'cursor.json');
    const c1 = new Cursor<EventCursor>(filePath);
    await c1.set({ txDigest: 'abc123', eventSeq: '7' });

    const onDisk = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(onDisk).toEqual({ txDigest: 'abc123', eventSeq: '7' });

    // Fresh Cursor instance reads the same value
    const c2 = new Cursor<EventCursor>(filePath);
    const v = await c2.load();
    expect(v).toEqual({ txDigest: 'abc123', eventSeq: '7' });
  });

  it('two awaited set() calls do not corrupt the file (last write wins)', async () => {
    const filePath = join(workDir, 'cursor.json');
    const c = new Cursor<EventCursor>(filePath);
    await c.set({ txDigest: 'first', eventSeq: '1' });
    await c.set({ txDigest: 'second', eventSeq: '2' });

    const onDisk = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(onDisk).toEqual({ txDigest: 'second', eventSeq: '2' });
    expect(c.value).toEqual({ txDigest: 'second', eventSeq: '2' });
  });

  it('mkdir parent dir if missing (writes a cursor file inside a not-yet-created dir)', async () => {
    const nestedPath = join(workDir, 'data', 'sub', 'cursor.json');
    const c = new Cursor<EventCursor>(nestedPath);
    await c.set({ txDigest: 'nested', eventSeq: '0' });

    const onDisk = JSON.parse(await fs.readFile(nestedPath, 'utf-8'));
    expect(onDisk).toEqual({ txDigest: 'nested', eventSeq: '0' });
  });

  it('rethrows non-ENOENT errors from load() (no silent fallback)', async () => {
    // Point at a directory; fs.readFile() returns EISDIR on POSIX, EACCES/EPERM
    // on Windows. Either way, the error code is NOT ENOENT and Cursor must
    // surface it.
    const c = new Cursor<EventCursor>(workDir);
    await expect(c.load()).rejects.toThrow();
  });

  it('value getter reflects the latest set() without round-tripping disk', async () => {
    const c = new Cursor<EventCursor>(join(workDir, 'cursor.json'));
    expect(c.value).toBeNull();
    await c.set({ txDigest: 'live', eventSeq: '5' });
    expect(c.value).toEqual({ txDigest: 'live', eventSeq: '5' });
  });
});
