import { EngineConfig, IEngine, KNOWN_ENGINE_TYPES } from './types';
import { VoicevoxEngine, AivisSpeechEngine } from './engines';
import { ProcessManager } from './process-manager';

export class EngineFactory {
  private processManager: ProcessManager;

  constructor(processManager?: ProcessManager) {
    this.processManager = processManager ?? new ProcessManager();
  }

  createEngine(config: EngineConfig): IEngine {
    switch (config.type) {
      case KNOWN_ENGINE_TYPES.VOICEVOX:
        return new VoicevoxEngine(config, this.processManager);
      
      case KNOWN_ENGINE_TYPES.AIVISSPEECH:
        return new AivisSpeechEngine(config, this.processManager);
      
      default:
        throw new Error(`Unknown engine type: ${config.type}`);
    }
  }

  createEngines(configs: EngineConfig[]): IEngine[] {
    return configs.map(config => this.createEngine(config));
  }

  static createFromConfigs(configs: EngineConfig[]): IEngine[] {
    const factory = new EngineFactory();
    return factory.createEngines(configs);
  }

  static getSupportedTypes(): string[] {
    return Object.values(KNOWN_ENGINE_TYPES);
  }

  static isTypeSupported(type: string): boolean {
    return Object.values(KNOWN_ENGINE_TYPES).includes(type as any);
  }
}

// Import at the bottom to avoid circular dependency
import { VoiceEngineManager } from './manager';

export class Manager extends VoiceEngineManager {
  constructor(configs: EngineConfig[]) {
    const engines = EngineFactory.createFromConfigs(configs);
    super(engines);
  }
}