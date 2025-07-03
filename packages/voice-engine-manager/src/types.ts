export interface PlaybackOptions {
  immediate?: boolean;
  waitForStart?: boolean;
  waitForEnd?: boolean;
}

export interface EngineConfig {
  name: string;
  type: string;
  url?: string;
  boot_command?: string | "auto" | "deny";
  default_speaker?: number | string;
  speedScale?: number;
  pitchScale?: number;
  intonationScale?: number;
  volumeScale?: number;
  playbackOptions?: PlaybackOptions;
  priority?: number;
  metadata?: Record<string, any>;
}

export interface EngineStatus {
  name: string;
  type: string;
  url: string;
  online: boolean;
  error?: string;
  latency?: number;
  version?: string;
}

export interface EngineInfo {
  name: string;
  type: string;
  url: string;
  priority: number;
  status: "stopped" | "starting" | "running" | "error";
  config: EngineConfig;
}

export interface IEngine {
  getName(): string;
  getType(): string;
  getConfig(): EngineConfig;
  updateConfig(config: Partial<EngineConfig>): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  ping(): Promise<EngineStatus>;
  getStatus(): "stopped" | "starting" | "running" | "error";
  getDefaultLaunchCommand(): string;
  findExecutableAndGenerateCommand(): Promise<string>;
  getHealthEndpoint(): string;
  getDefaultUrl(): string;
  getDefaultSpeaker(): number | string;
}

export interface FilterOptions {
  name?: string | string[];
  type?: string | string[];
}

export interface IVoiceEngineManager {
  start(name?: string): Promise<void>;
  stop(name?: string): Promise<void>;
  getConfig(filter?: FilterOptions): EngineConfig[];
  updateConfig(name: string, config: Partial<EngineConfig>): void;
  ping(filter?: FilterOptions): Promise<EngineStatus[]>;
  list(): EngineInfo[];
  fetchOnlineConfig(filter?: { type?: string | string[] }): Promise<EngineConfig[]>;
  addEngine(engine: IEngine): void;
  removeEngine(name: string): void;
  getEngine(name: string): IEngine | undefined;
}

export abstract class BaseEngine implements IEngine {
  protected config: EngineConfig;
  protected status: "stopped" | "starting" | "running" | "error" = "stopped";

  constructor(config: EngineConfig) {
    this.config = { ...config };
  }

  getName(): string {
    return this.config.name;
  }

  getType(): string {
    return this.config.type;
  }

  getConfig(): EngineConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<EngineConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      name: this.config.name,
      type: this.config.type
    };
  }

  getStatus(): "stopped" | "starting" | "running" | "error" {
    return this.status;
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract ping(): Promise<EngineStatus>;
  abstract getDefaultLaunchCommand(): string;
  abstract findExecutableAndGenerateCommand(): Promise<string>;
  abstract getHealthEndpoint(): string;
  abstract getDefaultUrl(): string;
  abstract getDefaultSpeaker(): number | string;
}

export const KNOWN_ENGINE_TYPES = {
  VOICEVOX: "voicevox",
  AIVISSPEECH: "aivisspeech"
} as const;

export const DEFAULT_ENGINE_URLS: Record<string, string> = {
  [KNOWN_ENGINE_TYPES.VOICEVOX]: "http://localhost:50021",
  [KNOWN_ENGINE_TYPES.AIVISSPEECH]: "http://localhost:10101"
};

export const DEFAULT_SPEAKERS: Record<string, number | string> = {
  [KNOWN_ENGINE_TYPES.VOICEVOX]: 1,
  [KNOWN_ENGINE_TYPES.AIVISSPEECH]: 888753764
};