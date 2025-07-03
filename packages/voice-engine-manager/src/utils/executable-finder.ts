import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

export interface ExecutableSearchResult {
  found: boolean;
  path?: string;
  searchedPaths: string[];
  error?: string;
}

export interface EngineExecutableInfo {
  name: string;
  windowsPaths: string[];
  macOSPaths: string[];
  linuxPaths: string[];
  fallbackCommand: string;
  launchArgs?: string[];
}

export class ExecutableFinder {
  private cache: Map<string, ExecutableSearchResult> = new Map();
  private readonly engines: Map<string, EngineExecutableInfo> = new Map();

  constructor() {
    this.initializeEngineDefinitions();
  }

  private initializeEngineDefinitions(): void {
    // VOICEVOX エンジン定義
    this.engines.set('voicevox', {
      name: 'VOICEVOX',
      windowsPaths: [
        join(homedir(), 'AppData', 'Local', 'Programs', 'VOICEVOX', 'VOICEVOX.exe'),
        'C:\\Program Files\\VOICEVOX\\VOICEVOX.exe',
        'C:\\Program Files (x86)\\VOICEVOX\\VOICEVOX.exe'
      ],
      macOSPaths: [
        '/Applications/VOICEVOX.app/Contents/MacOS/VOICEVOX',
        join(homedir(), 'Applications', 'VOICEVOX.app', 'Contents', 'MacOS', 'VOICEVOX')
      ],
      linuxPaths: [
        join(homedir(), 'Applications', 'VOICEVOX.AppImage'),
        join(homedir(), '.local', 'share', 'applications', 'VOICEVOX.AppImage'),
        '/opt/VOICEVOX/VOICEVOX',
        '/usr/local/bin/voicevox',
        '/usr/bin/voicevox'
      ],
      fallbackCommand: process.platform === 'win32' ? 'VOICEVOX.exe' : 'voicevox',
      launchArgs: process.platform === 'win32' ? ['--no-sandbox'] : []
    });

    // AivisSpeech エンジン定義
    this.engines.set('aivisspeech', {
      name: 'AivisSpeech',
      windowsPaths: [
        join(homedir(), 'AppData', 'Local', 'Programs', 'AivisSpeech', 'AivisSpeech.exe'),
        'C:\\Program Files\\AivisSpeech\\AivisSpeech.exe',
        'C:\\Program Files (x86)\\AivisSpeech\\AivisSpeech.exe'
      ],
      macOSPaths: [
        '/Applications/AivisSpeech.app/Contents/MacOS/AivisSpeech',
        join(homedir(), 'Applications', 'AivisSpeech.app', 'Contents', 'MacOS', 'AivisSpeech')
      ],
      linuxPaths: [
        join(homedir(), 'Applications', 'AivisSpeech.AppImage'),
        join(homedir(), '.local', 'share', 'applications', 'AivisSpeech.AppImage'),
        '/opt/AivisSpeech/AivisSpeech',
        '/usr/local/bin/aivisspeech',
        '/usr/bin/aivisspeech'
      ],
      fallbackCommand: process.platform === 'win32' ? 'AivisSpeech.exe' : 'aivisspeech',
      launchArgs: []
    });
  }

  async findExecutable(engineType: string, useCache: boolean = true): Promise<ExecutableSearchResult> {
    const cacheKey = `${engineType}-${process.platform}`;
    
    if (useCache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const engineInfo = this.engines.get(engineType.toLowerCase());
    if (!engineInfo) {
      const result: ExecutableSearchResult = {
        found: false,
        searchedPaths: [],
        error: `Unknown engine type: ${engineType}`
      };
      this.cache.set(cacheKey, result);
      return result;
    }

    const searchedPaths: string[] = [];
    const candidatePaths = this.getCandidatePaths(engineInfo);

    // 1. 固定パスを検索
    for (const path of candidatePaths) {
      searchedPaths.push(path);
      try {
        const resolvedPath = resolve(path);
        await fs.access(resolvedPath, fs.constants.F_OK | fs.constants.X_OK);
        const result: ExecutableSearchResult = {
          found: true,
          path: resolvedPath,
          searchedPaths
        };
        this.cache.set(cacheKey, result);
        return result;
      } catch (error) {
        // ファイルが存在しないか実行権限がない場合は次の候補を試す
        continue;
      }
    }

    // 2. PATH環境変数から検索
    const pathExecutable = await this.findInPath(engineInfo.fallbackCommand);
    searchedPaths.push(`PATH: ${engineInfo.fallbackCommand}`);
    
    if (pathExecutable) {
      const result: ExecutableSearchResult = {
        found: true,
        path: pathExecutable,
        searchedPaths
      };
      this.cache.set(cacheKey, result);
      return result;
    }

    // 3. 見つからない場合
    const result: ExecutableSearchResult = {
      found: false,
      searchedPaths,
      error: `${engineInfo.name} executable not found in any of the search paths`
    };
    this.cache.set(cacheKey, result);
    return result;
  }

  async generateLaunchCommand(engineType: string): Promise<string> {
    const searchResult = await this.findExecutable(engineType);
    const engineInfo = this.engines.get(engineType.toLowerCase());
    
    if (!engineInfo) {
      throw new Error(`Unknown engine type: ${engineType}`);
    }

    if (searchResult.found && searchResult.path) {
      // 実行ファイルが見つかった場合、絶対パスとオプションを含むコマンドを生成
      const command = searchResult.path;
      const args = engineInfo.launchArgs || [];
      return [command, ...args].join(' ');
    } else {
      // 見つからない場合はfallbackコマンドを使用（PATHに依存）
      const args = engineInfo.launchArgs || [];
      return [engineInfo.fallbackCommand, ...args].join(' ');
    }
  }

  getSupportedEngines(): string[] {
    return Array.from(this.engines.keys());
  }

  getEngineInfo(engineType: string): EngineExecutableInfo | undefined {
    return this.engines.get(engineType.toLowerCase());
  }

  clearCache(engineType?: string): void {
    if (engineType) {
      const cacheKey = `${engineType.toLowerCase()}-${process.platform}`;
      this.cache.delete(cacheKey);
    } else {
      this.cache.clear();
    }
  }

  private getCandidatePaths(engineInfo: EngineExecutableInfo): string[] {
    switch (process.platform) {
      case 'win32':
        return engineInfo.windowsPaths;
      case 'darwin':
        return engineInfo.macOSPaths;
      case 'linux':
        return engineInfo.linuxPaths;
      default:
        return engineInfo.linuxPaths; // デフォルトでLinuxパスを使用
    }
  }

  private async findInPath(command: string): Promise<string | null> {
    const pathEnv = process.env.PATH || '';
    const pathSeparator = process.platform === 'win32' ? ';' : ':';
    const pathExtensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat'] : [''];
    
    const paths = pathEnv.split(pathSeparator);

    for (const dir of paths) {
      if (!dir.trim()) continue;

      for (const ext of pathExtensions) {
        const fullPath = join(dir.trim(), command + ext);
        try {
          await fs.access(fullPath, fs.constants.F_OK | fs.constants.X_OK);
          return resolve(fullPath);
        } catch {
          // ファイルが存在しないか実行権限がない場合は次を試す
          continue;
        }
      }
    }

    return null;
  }
}