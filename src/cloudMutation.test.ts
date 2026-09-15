import { describe, expect, it, vi } from 'vitest';
import { persistThenCommit } from './cloudMutation';

describe('cloud-first mutations', () => {
  it('does not commit UI state when persistence fails', async () => {
    const commit = vi.fn();
    await expect(persistThenCommit(() => Promise.reject(new Error('network')), commit)).rejects.toThrow('network');
    expect(commit).not.toHaveBeenCalled();
  });

  it('supports retry and commits exactly once after success', async () => {
    const commit = vi.fn();
    let attempt = 0;
    const persist = async () => { attempt += 1; if (attempt === 1) throw new Error('temporary'); };
    await expect(persistThenCommit(persist, commit)).rejects.toThrow('temporary');
    await persistThenCommit(persist, commit);
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
