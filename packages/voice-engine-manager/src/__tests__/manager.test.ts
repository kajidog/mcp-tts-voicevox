import { VoiceEngineManager } from '../manager';
import { Manager, EngineFactory } from '../engine-factory';
import { VoicevoxEngine, AivisSpeechEngine } from '../engines';
import { EngineConfig, KNOWN_ENGINE_TYPES } from '../types';
import axios from 'axios';
import { spawn } from 'child_process';

jest.mock('axios');
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('Manager (Backward Compatibility)', () => {
  let manager: Manager;
  const mockConfigs: EngineConfig[] = [
    {
      name: 'main',
      type: KNOWN_ENGINE_TYPES.VOICEVOX,
      priority: 10,
      boot_command: 'deny'
    },
    {
      name: 'sub',
      type: KNOWN_ENGINE_TYPES.AIVISSPEECH,
      priority: 5,
      boot_command: 'auto'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new Manager(mockConfigs);
  });

  describe('constructor', () => {
    it('should initialize with provided configs', () => {
      const engines = manager.list();
      expect(engines).toHaveLength(2);
      expect(engines[0].name).toBe('main');
      expect(engines[1].name).toBe('sub');
    });

    it('should set default values for missing config properties', () => {
      const configs = manager.getConfig({ name: 'main' });
      expect(configs[0].url).toBe('http://localhost:50021');
      expect(configs[0].default_speaker).toBe(1);
      expect(configs[0].speedScale).toBe(1.0);
    });
  });

  describe('start', () => {
    it('should start a single engine', async () => {
      mockedAxios.get.mockResolvedValue({ data: '1.0.0' });
      
      await manager.start('main');
      
      const engines = manager.list();
      const mainEngine = engines.find(e => e.name === 'main');
      expect(mainEngine?.status).toBe('running');
    });

    it('should start all engines when no name provided', async () => {
      mockedAxios.get.mockResolvedValue({ data: '1.0.0' });
      const mockProcess = {
        on: jest.fn(),
        kill: jest.fn(),
        killed: false
      };
      mockedSpawn.mockReturnValue(mockProcess as any);
      
      await manager.start();
      
      const engines = manager.list();
      expect(engines.every(e => e.status === 'running' || e.status === 'starting')).toBe(true);
    });

    it('should throw error for non-existent engine', async () => {
      await expect(manager.start('nonexistent')).rejects.toThrow('Engine "nonexistent" not found');
    });

    it('should launch engine with auto boot_command', async () => {
      mockedAxios.get.mockResolvedValue({ data: '1.0.0' });
      const mockProcess = {
        on: jest.fn(),
        kill: jest.fn(),
        killed: false
      };
      mockedSpawn.mockReturnValue(mockProcess as any);
      
      await manager.start('sub');
      
      expect(mockedSpawn).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop a running engine', async () => {
      const mockProcess = {
        on: jest.fn((event, callback) => {
          if (event === 'exit') {
            setTimeout(callback, 10);
          }
        }),
        kill: jest.fn(),
        killed: false
      };
      mockedSpawn.mockReturnValue(mockProcess as any);
      mockedAxios.get.mockResolvedValue({ data: '1.0.0' });
      
      await manager.start('sub');
      await manager.stop('sub');
      
      const engines = manager.list();
      const subEngine = engines.find(e => e.name === 'sub');
      expect(subEngine?.status).toBe('stopped');
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should stop all engines when no name provided', async () => {
      await manager.stop();
      
      const engines = manager.list();
      expect(engines.every(e => e.status === 'stopped')).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return all configs when no filter provided', () => {
      const configs = manager.getConfig();
      expect(configs).toHaveLength(2);
      expect(configs.map(c => c.name)).toEqual(['main', 'sub']);
    });

    it('should filter by name', () => {
      const configs = manager.getConfig({ name: 'main' });
      expect(configs).toHaveLength(1);
      expect(configs[0].name).toBe('main');
    });

    it('should filter by multiple names', () => {
      const configs = manager.getConfig({ name: ['main', 'sub'] });
      expect(configs).toHaveLength(2);
      expect(configs.map(c => c.name)).toEqual(['main', 'sub']);
    });

    it('should filter by type', () => {
      const configs = manager.getConfig({ type: KNOWN_ENGINE_TYPES.VOICEVOX });
      expect(configs).toHaveLength(1);
      expect(configs[0].type).toBe(KNOWN_ENGINE_TYPES.VOICEVOX);
    });

    it('should filter by multiple types', () => {
      const configs = manager.getConfig({ type: [KNOWN_ENGINE_TYPES.VOICEVOX, KNOWN_ENGINE_TYPES.AIVISSPEECH] });
      expect(configs).toHaveLength(2);
    });

    it('should filter by name and type', () => {
      const configs = manager.getConfig({ name: 'main', type: KNOWN_ENGINE_TYPES.VOICEVOX });
      expect(configs).toHaveLength(1);
      expect(configs[0].name).toBe('main');
      expect(configs[0].type).toBe(KNOWN_ENGINE_TYPES.VOICEVOX);
    });

    it('should return empty array for non-existent filter', () => {
      const configs = manager.getConfig({ name: 'nonexistent' });
      expect(configs).toHaveLength(0);
    });
  });

  describe('updateConfig', () => {
    it('should update existing config', () => {
      manager.updateConfig('main', { speedScale: 1.5, priority: 20 });
      
      const configs = manager.getConfig({ name: 'main' });
      expect(configs[0].speedScale).toBe(1.5);
      expect(configs[0].priority).toBe(20);
    });

    it('should not allow changing name or type', () => {
      manager.updateConfig('main', { name: 'new-name' as any, type: KNOWN_ENGINE_TYPES.AIVISSPEECH as any });
      
      const configs = manager.getConfig({ name: 'main' });
      expect(configs[0].name).toBe('main');
      expect(configs[0].type).toBe(KNOWN_ENGINE_TYPES.VOICEVOX);
    });

    it('should throw error for non-existent engine', () => {
      expect(() => manager.updateConfig('nonexistent', {})).toThrow('Engine "nonexistent" not found');
    });
  });

  describe('ping', () => {
    it('should return status for filtered engine by name', async () => {
      mockedAxios.get.mockResolvedValue({ data: '1.0.0' });
      
      const statuses = await manager.ping({ name: 'main' });
      
      expect(statuses).toHaveLength(1);
      expect(statuses[0].name).toBe('main');
      expect(statuses[0].online).toBe(true);
      expect(statuses[0].version).toBe('1.0.0');
    });

    it('should return status for filtered engines by type', async () => {
      mockedAxios.get.mockResolvedValue({ data: '1.0.0' });
      
      const statuses = await manager.ping({ type: KNOWN_ENGINE_TYPES.VOICEVOX });
      
      expect(statuses).toHaveLength(1);
      expect(statuses[0].name).toBe('main');
      expect(statuses[0].type).toBe(KNOWN_ENGINE_TYPES.VOICEVOX);
    });

    it('should return status for offline engine', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Connection refused'));
      
      const statuses = await manager.ping({ name: 'main' });
      
      expect(statuses).toHaveLength(1);
      expect(statuses[0].name).toBe('main');
      expect(statuses[0].online).toBe(false);
      expect(statuses[0].error).toBe('Connection refused');
    });

    it('should return statuses for all engines when no filter provided', async () => {
      mockedAxios.get.mockResolvedValue({ data: '1.0.0' });
      
      const statuses = await manager.ping();
      
      expect(statuses).toHaveLength(2);
      expect(statuses.map(s => s.name)).toEqual(['main', 'sub']);
    });

    it('should filter by multiple names', async () => {
      mockedAxios.get.mockResolvedValue({ data: '1.0.0' });
      
      const statuses = await manager.ping({ name: ['main', 'sub'] });
      
      expect(statuses).toHaveLength(2);
      expect(statuses.map(s => s.name)).toEqual(['main', 'sub']);
    });
  });

  describe('list', () => {
    it('should return all engine infos', () => {
      const engines = manager.list();
      
      expect(engines).toHaveLength(2);
      expect(engines[0]).toMatchObject({
        name: 'main',
        type: KNOWN_ENGINE_TYPES.VOICEVOX,
        url: 'http://localhost:50021',
        priority: 10,
        status: 'stopped'
      });
      expect(engines[1]).toMatchObject({
        name: 'sub',
        type: KNOWN_ENGINE_TYPES.AIVISSPEECH,
        url: 'http://localhost:10101',
        priority: 5,
        status: 'stopped'
      });
    });
  });

  describe('fetchOnlineConfig', () => {
    it('should return online configs from ping results', async () => {
      mockedAxios.get.mockResolvedValue({ data: '1.0.0' });
      
      const configs = await manager.fetchOnlineConfig();
      
      expect(configs).toHaveLength(2);
      expect(configs.map(c => c.name)).toEqual(['main', 'sub']);
    });

    it('should filter by type', async () => {
      mockedAxios.get.mockResolvedValue({ data: '1.0.0' });
      
      const configs = await manager.fetchOnlineConfig({ type: KNOWN_ENGINE_TYPES.VOICEVOX });
      
      expect(configs).toHaveLength(1);
      expect(configs[0].type).toBe(KNOWN_ENGINE_TYPES.VOICEVOX);
    });

    it('should filter by multiple types', async () => {
      mockedAxios.get.mockResolvedValue({ data: '1.0.0' });
      
      const configs = await manager.fetchOnlineConfig({ type: [KNOWN_ENGINE_TYPES.VOICEVOX, KNOWN_ENGINE_TYPES.AIVISSPEECH] });
      
      expect(configs).toHaveLength(2);
    });

    it('should return only online engines', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({ data: '1.0.0' }) // main online
        .mockRejectedValueOnce(new Error('Connection refused')); // sub offline
      
      const configs = await manager.fetchOnlineConfig();
      
      expect(configs).toHaveLength(1);
      expect(configs[0].name).toBe('main');
    });

    it('should return empty array when no engines are online', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Connection refused'));
      
      const configs = await manager.fetchOnlineConfig();
      
      expect(configs).toHaveLength(0);
    });
  });
});

describe('VoiceEngineManager (New DI Architecture)', () => {
  let voiceEngineManager: VoiceEngineManager;
  let voicevoxEngine: VoicevoxEngine;
  let aivisEngine: AivisSpeechEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    
    voicevoxEngine = new VoicevoxEngine({
      name: 'voicevox-main',
      type: KNOWN_ENGINE_TYPES.VOICEVOX,
      priority: 1,
      boot_command: 'deny'
    });

    aivisEngine = new AivisSpeechEngine({
      name: 'aivis-main',
      type: KNOWN_ENGINE_TYPES.AIVISSPEECH,
      priority: 2,
      boot_command: 'deny'
    });

    voiceEngineManager = new VoiceEngineManager([voicevoxEngine, aivisEngine]);
  });

  describe('constructor', () => {
    it('should initialize with provided engines', () => {
      const engines = voiceEngineManager.list();
      expect(engines).toHaveLength(2);
      expect(engines.map(e => e.name)).toEqual(['voicevox-main', 'aivis-main']);
    });

    it('should allow empty initialization', () => {
      const emptyManager = new VoiceEngineManager();
      expect(emptyManager.list()).toHaveLength(0);
    });
  });

  describe('addEngine', () => {
    it('should add new engine', () => {
      const newEngine = new VoicevoxEngine({
        name: 'voicevox-secondary',
        type: KNOWN_ENGINE_TYPES.VOICEVOX
      });

      voiceEngineManager.addEngine(newEngine);
      
      const engines = voiceEngineManager.list();
      expect(engines).toHaveLength(3);
      expect(engines.find(e => e.name === 'voicevox-secondary')).toBeDefined();
    });

    it('should throw error for duplicate engine name', () => {
      const duplicateEngine = new VoicevoxEngine({
        name: 'voicevox-main',
        type: KNOWN_ENGINE_TYPES.VOICEVOX
      });

      expect(() => voiceEngineManager.addEngine(duplicateEngine))
        .toThrow('Engine "voicevox-main" already exists');
    });
  });

  describe('removeEngine', () => {
    it('should remove engine', () => {
      voiceEngineManager.removeEngine('voicevox-main');
      
      const engines = voiceEngineManager.list();
      expect(engines).toHaveLength(1);
      expect(engines[0].name).toBe('aivis-main');
    });

    it('should throw error for non-existent engine', () => {
      expect(() => voiceEngineManager.removeEngine('nonexistent'))
        .toThrow('Engine "nonexistent" not found');
    });
  });

  describe('getEngine', () => {
    it('should return engine by name', () => {
      const engine = voiceEngineManager.getEngine('voicevox-main');
      expect(engine).toBe(voicevoxEngine);
    });

    it('should return undefined for non-existent engine', () => {
      const engine = voiceEngineManager.getEngine('nonexistent');
      expect(engine).toBeUndefined();
    });
  });

  describe('start', () => {
    it('should delegate start to engine', async () => {
      const startSpy = jest.spyOn(voicevoxEngine, 'start').mockResolvedValue();
      
      await voiceEngineManager.start('voicevox-main');
      
      expect(startSpy).toHaveBeenCalledTimes(1);
    });

    it('should start all engines when no name provided', async () => {
      const voicevoxStartSpy = jest.spyOn(voicevoxEngine, 'start').mockResolvedValue();
      const aivisStartSpy = jest.spyOn(aivisEngine, 'start').mockResolvedValue();
      
      await voiceEngineManager.start();
      
      expect(voicevoxStartSpy).toHaveBeenCalledTimes(1);
      expect(aivisStartSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('ping', () => {
    it('should delegate ping to engines', async () => {
      const voicevoxPingSpy = jest.spyOn(voicevoxEngine, 'ping').mockResolvedValue({
        name: 'voicevox-main',
        type: KNOWN_ENGINE_TYPES.VOICEVOX,
        url: 'http://localhost:50021',
        online: true
      });

      const aivisPingSpy = jest.spyOn(aivisEngine, 'ping').mockResolvedValue({
        name: 'aivis-main',
        type: KNOWN_ENGINE_TYPES.AIVISSPEECH,
        url: 'http://localhost:10101',
        online: true
      });
      
      const statuses = await voiceEngineManager.ping();
      
      expect(statuses).toHaveLength(2);
      expect(voicevoxPingSpy).toHaveBeenCalledTimes(1);
      expect(aivisPingSpy).toHaveBeenCalledTimes(1);
    });
  });
});

describe('EngineFactory', () => {
  describe('createEngine', () => {
    it('should create VoicevoxEngine for voicevox type', () => {
      const factory = new EngineFactory();
      const config: EngineConfig = {
        name: 'test-voicevox',
        type: KNOWN_ENGINE_TYPES.VOICEVOX
      };

      const engine = factory.createEngine(config);
      
      expect(engine).toBeInstanceOf(VoicevoxEngine);
      expect(engine.getName()).toBe('test-voicevox');
      expect(engine.getType()).toBe(KNOWN_ENGINE_TYPES.VOICEVOX);
    });

    it('should create AivisSpeechEngine for aivisspeech type', () => {
      const factory = new EngineFactory();
      const config: EngineConfig = {
        name: 'test-aivis',
        type: KNOWN_ENGINE_TYPES.AIVISSPEECH
      };

      const engine = factory.createEngine(config);
      
      expect(engine).toBeInstanceOf(AivisSpeechEngine);
      expect(engine.getName()).toBe('test-aivis');
      expect(engine.getType()).toBe(KNOWN_ENGINE_TYPES.AIVISSPEECH);
    });

    it('should throw error for unknown engine type', () => {
      const factory = new EngineFactory();
      const config: EngineConfig = {
        name: 'test-unknown',
        type: 'unknown-type'
      };

      expect(() => factory.createEngine(config))
        .toThrow('Unknown engine type: unknown-type');
    });
  });

  describe('static methods', () => {
    it('should return supported types', () => {
      const types = EngineFactory.getSupportedTypes();
      expect(types).toEqual([KNOWN_ENGINE_TYPES.VOICEVOX, KNOWN_ENGINE_TYPES.AIVISSPEECH]);
    });

    it('should check if type is supported', () => {
      expect(EngineFactory.isTypeSupported(KNOWN_ENGINE_TYPES.VOICEVOX)).toBe(true);
      expect(EngineFactory.isTypeSupported(KNOWN_ENGINE_TYPES.AIVISSPEECH)).toBe(true);
      expect(EngineFactory.isTypeSupported('unknown')).toBe(false);
    });
  });
});