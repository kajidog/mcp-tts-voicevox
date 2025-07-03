import { BaseEngine, EngineConfig, EngineStatus, KNOWN_ENGINE_TYPES, DEFAULT_ENGINE_URLS, DEFAULT_SPEAKERS } from '../types';
import { ProcessManager } from '../process-manager';
import { ExecutableFinder } from '../utils/executable-finder';

export class AivisSpeechEngine extends BaseEngine {
  private processManager: ProcessManager;
  private executableFinder: ExecutableFinder;

  constructor(config: EngineConfig, processManager?: ProcessManager, executableFinder?: ExecutableFinder) {
    const fullConfig: EngineConfig = {
      url: DEFAULT_ENGINE_URLS[KNOWN_ENGINE_TYPES.AIVISSPEECH],
      default_speaker: DEFAULT_SPEAKERS[KNOWN_ENGINE_TYPES.AIVISSPEECH],
      speedScale: 1.0,
      pitchScale: 0.0,
      intonationScale: 1.0,
      volumeScale: 1.0,
      priority: 0,
      boot_command: "deny",
      ...config,
      type: KNOWN_ENGINE_TYPES.AIVISSPEECH
    };

    super(fullConfig);
    this.processManager = processManager ?? new ProcessManager();
    this.executableFinder = executableFinder ?? new ExecutableFinder();
  }

  async start(): Promise<void> {
    if (this.status === "running") {
      return;
    }

    this.status = "starting";

    try {
      const url = this.config.url || this.getDefaultUrl();
      
      if (this.config.boot_command === "auto") {
        const command = await this.findExecutableAndGenerateCommand();
        await this.processManager.launchProcess(
          this.config.name,
          command,
          url,
          this.getHealthEndpoint()
        );
      } else if (this.config.boot_command && this.config.boot_command !== "deny") {
        await this.processManager.launchProcess(
          this.config.name,
          this.config.boot_command,
          url,
          this.getHealthEndpoint()
        );
      }

      const isOnline = await this.processManager.checkHealth(url, this.getHealthEndpoint());
      if (!isOnline && this.config.boot_command === "deny") {
        throw new Error(`AivisSpeech engine "${this.config.name}" is not running and boot_command is "deny"`);
      }

      this.status = "running";
    } catch (error) {
      this.status = "error";
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.status === "stopped") {
      return;
    }

    await this.processManager.killProcess(this.config.name);
    this.status = "stopped";
  }

  async ping(): Promise<EngineStatus> {
    const url = this.config.url || this.getDefaultUrl();
    const result = await this.processManager.pingWithLatency(url, this.getHealthEndpoint());

    return {
      name: this.config.name,
      type: this.config.type,
      url,
      online: result.online,
      error: result.error,
      latency: result.latency,
      version: result.version
    };
  }

  getDefaultLaunchCommand(): string {
    return process.platform === "win32"
      ? "AivisSpeech.exe"
      : "./AivisSpeech";
  }

  async findExecutableAndGenerateCommand(): Promise<string> {
    try {
      const command = await this.executableFinder.generateLaunchCommand(KNOWN_ENGINE_TYPES.AIVISSPEECH);
      console.log(`AivisSpeech engine "${this.config.name}": Using command: ${command}`);
      return command;
    } catch (error) {
      console.warn(`AivisSpeech engine "${this.config.name}": Failed to find executable, falling back to default command. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return this.getDefaultLaunchCommand();
    }
  }

  getHealthEndpoint(): string {
    return "/version";
  }

  getDefaultUrl(): string {
    return DEFAULT_ENGINE_URLS[KNOWN_ENGINE_TYPES.AIVISSPEECH];
  }

  getDefaultSpeaker(): number | string {
    return DEFAULT_SPEAKERS[KNOWN_ENGINE_TYPES.AIVISSPEECH];
  }
}