import * as path from 'path';

// We need to discover the knowledge directory path the module resolves to.
// The module computes it at import time, so we let it use the real path
// and control behavior via fs mocks.
const KNOWLEDGE_DIR_SRC = path.resolve(__dirname, '../src/knowledge');

let mockReaddir: jest.Mock;
let mockReadFile: jest.Mock;
let mockExistsSync: jest.Mock;

jest.mock('fs', () => {
  mockReaddir = jest.fn();
  mockReadFile = jest.fn();
  mockExistsSync = jest.fn();
  return {
    existsSync: mockExistsSync,
    promises: {
      readdir: mockReaddir,
      readFile: mockReadFile,
    },
  };
});

import { KnowledgeService } from '../src/services/knowledge/knowledgeService';

// After import, discover which directory the service resolved to.
// We read it from the first readdir call in the first test.
let resolvedDir = KNOWLEDGE_DIR_SRC;

function fakeFilePath(filename: string): string {
  return path.join(resolvedDir, filename);
}

describe('KnowledgeService', () => {
  let service: KnowledgeService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    service = new KnowledgeService();
    // Make the dist knowledge dir exist so resolveKnowledgeDir picks it
    mockExistsSync.mockImplementation((p: string) => p === KNOWLEDGE_DIR_SRC);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Capture the actual resolved directory from the first readdir call
  function captureDir(): void {
    if (mockReaddir.mock.calls.length > 0) {
      resolvedDir = mockReaddir.mock.calls[0][0];
    }
  }

  // ========================================================
  // 1. Loads all .md files, sorts alphabetically, joins with \n\n
  // ========================================================
  describe('loadContext — basic loading', () => {
    it('loads all .md files sorted alphabetically, joined with double newline', async () => {
      mockReaddir.mockResolvedValue(['zebra.md', 'alpha.md', 'beta.md']);
      mockReadFile
        .mockResolvedValueOnce('Content of alpha')
        .mockResolvedValueOnce('Content of beta')
        .mockResolvedValueOnce('Content of zebra');

      const result = await service.loadContext();
      captureDir();

      expect(mockReaddir).toHaveBeenCalledTimes(1);
      expect(mockReadFile).toHaveBeenCalledTimes(3);
      expect(mockReadFile).toHaveBeenNthCalledWith(1, fakeFilePath('alpha.md'), 'utf-8');
      expect(mockReadFile).toHaveBeenNthCalledWith(2, fakeFilePath('beta.md'), 'utf-8');
      expect(mockReadFile).toHaveBeenNthCalledWith(3, fakeFilePath('zebra.md'), 'utf-8');
      expect(result).toBe('Content of alpha\n\nContent of beta\n\nContent of zebra');
    });
  });

  // ========================================================
  // 2. Single file read failure is skipped
  // ========================================================
  describe('loadContext — partial failure', () => {
    it('skips a file that fails to read, loads the rest', async () => {
      mockReaddir.mockResolvedValue(['alpha.md', 'broken.md', 'charlie.md']);
      mockReadFile
        .mockResolvedValueOnce('Alpha content')
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValueOnce('Charlie content');

      const result = await service.loadContext();
      captureDir();

      expect(result).toBe('Alpha content\n\nCharlie content');
      expect(mockReadFile).toHaveBeenCalledTimes(3);
    });

    it('throws if ALL files fail to read', async () => {
      mockReaddir.mockResolvedValue(['alpha.md', 'beta.md']);
      mockReadFile
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'));

      await expect(service.loadContext()).rejects.toThrow('All markdown files');
    });
  });

  // ========================================================
  // 3. Cache: second call within TTL returns cached result
  // ========================================================
  describe('loadContext — caching', () => {
    it('second call within TTL returns cached result (readdir NOT called twice)', async () => {
      mockReaddir.mockResolvedValue(['alpha.md']);
      mockReadFile.mockResolvedValueOnce('Alpha content');

      const first = await service.loadContext();
      expect(mockReaddir).toHaveBeenCalledTimes(1);

      const second = await service.loadContext();
      expect(mockReaddir).toHaveBeenCalledTimes(1);
      expect(second).toBe('Alpha content');
      expect(second).toBe(first);
    });

    it('after TTL expires, re-reads from disk', async () => {
      mockReaddir.mockResolvedValue(['alpha.md']);
      mockReadFile.mockResolvedValue('Alpha content');

      await service.loadContext();
      expect(mockReaddir).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(5 * 60 * 1000 + 1);

      mockReaddir.mockResolvedValue(['alpha.md']);
      mockReadFile.mockResolvedValueOnce('Alpha content updated');

      const result2 = await service.loadContext();
      expect(mockReaddir).toHaveBeenCalledTimes(2);
      expect(result2).toBe('Alpha content updated');
    });
  });

  // ========================================================
  // 4. invalidateCache() forces re-read
  // ========================================================
  describe('invalidateCache', () => {
    it('forces re-read on next loadContext call', async () => {
      mockReaddir.mockResolvedValue(['alpha.md']);
      mockReadFile.mockResolvedValue('Alpha content');

      await service.loadContext();
      expect(mockReaddir).toHaveBeenCalledTimes(1);

      service.invalidateCache();

      mockReaddir.mockResolvedValue(['alpha.md']);
      mockReadFile.mockResolvedValueOnce('Alpha content refreshed');

      await service.loadContext();
      expect(mockReaddir).toHaveBeenCalledTimes(2);
    });
  });

  // ========================================================
  // 5. Empty directory throws error
  // ========================================================
  describe('loadContext — empty directory', () => {
    it('throws error when directory has no .md files', async () => {
      mockReaddir.mockResolvedValue(['readme.txt', 'config.json']);

      await expect(service.loadContext()).rejects.toThrow('No markdown files found');
    });

    it('throws error when directory is completely empty', async () => {
      mockReaddir.mockResolvedValue([]);

      await expect(service.loadContext()).rejects.toThrow('No markdown files found');
    });
  });

  // ========================================================
  // 6. Missing directory throws error
  // ========================================================
  describe('loadContext — missing directory', () => {
    it('throws error when knowledge directory does not exist', async () => {
      mockReaddir.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      await expect(service.loadContext()).rejects.toThrow('Knowledge directory not found');
    });
  });
});
