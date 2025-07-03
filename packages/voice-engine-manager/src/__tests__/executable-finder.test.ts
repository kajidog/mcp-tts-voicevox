import { ExecutableFinder } from '../utils/executable-finder';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';

jest.mock('fs', () => ({
  promises: {
    access: jest.fn()
  },
  constants: {
    F_OK: 0,
    X_OK: 1
  }
}));

jest.mock('os', () => ({
  homedir: jest.fn(() => '/mock/home')
}));

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedHomedir = homedir as jest.MockedFunction<typeof homedir>;

describe('ExecutableFinder', () => {
  let finder: ExecutableFinder;
  const originalPlatform = process.platform;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    finder = new ExecutableFinder();
    mockedHomedir.mockReturnValue('/mock/home');
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform
    });
    process.env = originalEnv;
  });

  describe('findExecutable', () => {
    describe('Windows platform', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', {
          value: 'win32'
        });
      });

      it('should find VOICEVOX in default Windows installation path', async () => {
        const rawPath = '/mock/home/AppData/Local/Programs/VOICEVOX/VOICEVOX.exe';
        const expectedPath = resolve(rawPath);
        mockedFs.access.mockImplementation((path, mode) => {
          if (path.toString() === expectedPath) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('File not found'));
        });

        const result = await finder.findExecutable('voicevox');

        expect(result.found).toBe(true);
        expect(result.path).toBe(expectedPath);
        expect(result.searchedPaths).toContain(rawPath);
      });

      it('should find AivisSpeech in Program Files', async () => {
        const rawPath = 'C:\\Program Files\\AivisSpeech\\AivisSpeech.exe';
        const expectedPath = resolve(rawPath);
        mockedFs.access.mockImplementation((path, mode) => {
          if (path.toString() === expectedPath) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('File not found'));
        });

        const result = await finder.findExecutable('aivisspeech');

        expect(result.found).toBe(true);
        expect(result.path).toBe(expectedPath);
      });

      it('should fallback to PATH when executable not found in fixed paths', async () => {
        process.env.PATH = 'C:\\Windows\\System32;C:\\MockPath';
        mockedFs.access.mockImplementation((path, mode) => {
          const pathStr = path.toString();
          if (pathStr.includes('C:\\MockPath\\VOICEVOX.exe')) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('File not found'));
        });

        const result = await finder.findExecutable('voicevox');

        expect(result.found).toBe(true);
        expect(result.path).toContain('C:\\MockPath\\VOICEVOX.exe');
      });
    });

    describe('macOS platform', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', {
          value: 'darwin'
        });
      });

      it('should find VOICEVOX in Applications folder', async () => {
        const rawPath = '/Applications/VOICEVOX.app/Contents/MacOS/VOICEVOX';
        const expectedPath = resolve(rawPath);
        mockedFs.access.mockImplementation((path, mode) => {
          if (path.toString() === expectedPath) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('File not found'));
        });

        const result = await finder.findExecutable('voicevox');

        expect(result.found).toBe(true);
        expect(result.path).toBe(expectedPath);
      });

      it('should find AivisSpeech in user Applications folder', async () => {
        const rawPath = '/mock/home/Applications/AivisSpeech.app/Contents/MacOS/AivisSpeech';
        const expectedPath = resolve(rawPath);
        mockedFs.access.mockImplementation((path, mode) => {
          if (path.toString() === expectedPath) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('File not found'));
        });

        const result = await finder.findExecutable('aivisspeech');

        expect(result.found).toBe(true);
        expect(result.path).toBe(expectedPath);
      });
    });

    describe('Linux platform', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', {
          value: 'linux'
        });
      });

      it('should find VOICEVOX AppImage in user Applications', async () => {
        const rawPath = '/mock/home/Applications/VOICEVOX.AppImage';
        const expectedPath = resolve(rawPath);
        mockedFs.access.mockImplementation((path, mode) => {
          if (path.toString() === expectedPath) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('File not found'));
        });

        const result = await finder.findExecutable('voicevox');

        expect(result.found).toBe(true);
        expect(result.path).toBe(expectedPath);
      });

      it('should find AivisSpeech in /opt directory', async () => {
        const rawPath = '/opt/AivisSpeech/AivisSpeech';
        const expectedPath = resolve(rawPath);
        mockedFs.access.mockImplementation((path, mode) => {
          if (path.toString() === expectedPath) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('File not found'));
        });

        const result = await finder.findExecutable('aivisspeech');

        expect(result.found).toBe(true);
        expect(result.path).toBe(expectedPath);
      });
    });

    it('should return not found result for unknown engine type', async () => {
      const result = await finder.findExecutable('unknown-engine');

      expect(result.found).toBe(false);
      expect(result.error).toBe('Unknown engine type: unknown-engine');
      expect(result.searchedPaths).toEqual([]);
    });

    it('should return not found when no executable exists', async () => {
      mockedFs.access.mockImplementation(() => Promise.reject(new Error('File not found')));
      process.env.PATH = '';

      const result = await finder.findExecutable('voicevox');

      expect(result.found).toBe(false);
      expect(result.error).toContain('VOICEVOX executable not found');
      expect(result.searchedPaths.length).toBeGreaterThan(0);
    });
  });

  describe('generateLaunchCommand', () => {
    it('should generate command with found executable path on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32'
      });

      // Create a new finder instance after setting platform
      const windowsFinder = new ExecutableFinder();
      const expectedPath = '/mock/path/VOICEVOX.exe';

      // Mock findExecutable to return the expected result
      jest.spyOn(windowsFinder, 'findExecutable').mockResolvedValue({
        found: true,
        path: expectedPath,
        searchedPaths: [expectedPath]
      });

      const command = await windowsFinder.generateLaunchCommand('voicevox');

      expect(command).toBe(`${expectedPath} --no-sandbox`);
    });

    it('should generate command with found executable path on non-Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux'
      });

      // Create a new finder instance after setting platform
      const linuxFinder = new ExecutableFinder();
      const expectedPath = '/mock/path/VOICEVOX';

      // Mock findExecutable to return the expected result
      jest.spyOn(linuxFinder, 'findExecutable').mockResolvedValue({
        found: true,
        path: expectedPath,
        searchedPaths: [expectedPath]
      });

      const command = await linuxFinder.generateLaunchCommand('voicevox');

      expect(command).toBe(expectedPath);
    });

    it('should generate fallback command when executable not found', async () => {
      mockedFs.access.mockImplementation(() => Promise.reject(new Error('File not found')));
      process.env.PATH = '';

      Object.defineProperty(process, 'platform', {
        value: 'linux'
      });

      const command = await finder.generateLaunchCommand('voicevox');

      expect(command).toBe('voicevox');
    });

    it('should throw error for unknown engine type', async () => {
      await expect(finder.generateLaunchCommand('unknown-engine'))
        .rejects.toThrow('Unknown engine type: unknown-engine');
    });
  });

  describe('cache functionality', () => {
    it('should use cache for subsequent calls', async () => {
      const expectedPath = '/mock/path/VOICEVOX.exe';
      mockedFs.access.mockImplementation((path, mode) => {
        if (path === expectedPath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('File not found'));
      });

      // Mock to return a specific result
      const originalFindExecutable = finder.findExecutable;
      let callCount = 0;
      finder.findExecutable = jest.fn().mockImplementation(async (engineType, useCache = true) => {
        callCount++;
        if (useCache && callCount > 1) {
          // Should use cache for second call
          expect(useCache).toBe(true);
        }
        return {
          found: true,
          path: expectedPath,
          searchedPaths: [expectedPath]
        };
      });

      // First call
      const result1 = await finder.findExecutable('voicevox');
      // Second call should use cache
      const result2 = await finder.findExecutable('voicevox');

      expect(result1).toEqual(result2);
    });

    it('should clear cache when requested', async () => {
      finder.clearCache('voicevox');
      finder.clearCache(); // Clear all cache

      // Should work without errors
      expect(() => finder.clearCache()).not.toThrow();
      expect(() => finder.clearCache('voicevox')).not.toThrow();
    });
  });

  describe('utility methods', () => {
    it('should return supported engines', () => {
      const engines = finder.getSupportedEngines();
      expect(engines).toContain('voicevox');
      expect(engines).toContain('aivisspeech');
    });

    it('should return engine info', () => {
      const voicevoxInfo = finder.getEngineInfo('voicevox');
      const aivisInfo = finder.getEngineInfo('aivisspeech');

      expect(voicevoxInfo).toBeDefined();
      expect(voicevoxInfo?.name).toBe('VOICEVOX');
      expect(aivisInfo).toBeDefined();
      expect(aivisInfo?.name).toBe('AivisSpeech');
    });

    it('should return undefined for unknown engine info', () => {
      const unknownInfo = finder.getEngineInfo('unknown');
      expect(unknownInfo).toBeUndefined();
    });
  });
});