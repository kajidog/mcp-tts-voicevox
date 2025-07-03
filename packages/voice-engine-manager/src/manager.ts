import { 
  EngineConfig, 
  EngineStatus, 
  EngineInfo, 
  IVoiceEngineManager,
  IEngine,
  FilterOptions
} from './types';

export class VoiceEngineManager implements IVoiceEngineManager {
  private engines: Map<string, IEngine> = new Map();

  constructor(engines: IEngine[] = []) {
    engines.forEach(engine => {
      this.engines.set(engine.getName(), engine);
    });
  }

  async start(name?: string): Promise<void> {
    if (!name) {
      const promises = Array.from(this.engines.keys()).map(n => this.start(n));
      await Promise.all(promises);
      return;
    }

    const engine = this.engines.get(name);
    if (!engine) {
      throw new Error(`Engine "${name}" not found`);
    }

    await engine.start();
  }

  async stop(name?: string): Promise<void> {
    if (!name) {
      const promises = Array.from(this.engines.keys()).map(n => this.stop(n));
      await Promise.all(promises);
      return;
    }

    const engine = this.engines.get(name);
    if (!engine) {
      throw new Error(`Engine "${name}" not found`);
    }

    await engine.stop();
  }

  getConfig(filter?: FilterOptions): EngineConfig[] {
    let engines = Array.from(this.engines.values());

    if (filter) {
      if (filter.name) {
        const names = Array.isArray(filter.name) ? filter.name : [filter.name];
        engines = engines.filter(e => names.includes(e.getName()));
      }
      
      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        engines = engines.filter(e => types.includes(e.getType()));
      }
    }

    return engines.map(e => e.getConfig());
  }

  updateConfig(name: string, config: Partial<EngineConfig>): void {
    const engine = this.engines.get(name);
    if (!engine) {
      throw new Error(`Engine "${name}" not found`);
    }

    engine.updateConfig(config);
  }

  async ping(filter?: FilterOptions): Promise<EngineStatus[]> {
    let engines = Array.from(this.engines.values());

    if (filter) {
      if (filter.name) {
        const names = Array.isArray(filter.name) ? filter.name : [filter.name];
        engines = engines.filter(e => names.includes(e.getName()));
      }
      
      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        engines = engines.filter(e => types.includes(e.getType()));
      }
    }

    const promises = engines.map(engine => engine.ping());
    return Promise.all(promises);
  }

  list(): EngineInfo[] {
    return Array.from(this.engines.values()).map(engine => {
      const config = engine.getConfig();
      return {
        name: engine.getName(),
        type: engine.getType(),
        url: config.url || engine.getDefaultUrl(),
        priority: config.priority ?? 0,
        status: engine.getStatus(),
        config
      };
    });
  }

  async fetchOnlineConfig(filter?: { type?: string | string[] }): Promise<EngineConfig[]> {
    let engines = Array.from(this.engines.values());
    
    if (filter?.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      engines = engines.filter(e => types.includes(e.getType()));
    }

    const statuses = await this.ping({ name: engines.map(e => e.getName()) });
    const onlineEngines = engines.filter(engine => {
      const status = statuses.find(s => s.name === engine.getName());
      return status?.online === true;
    });

    return onlineEngines.map(e => e.getConfig());
  }

  addEngine(engine: IEngine): void {
    const name = engine.getName();
    if (this.engines.has(name)) {
      throw new Error(`Engine "${name}" already exists`);
    }
    this.engines.set(name, engine);
  }

  removeEngine(name: string): void {
    const engine = this.engines.get(name);
    if (!engine) {
      throw new Error(`Engine "${name}" not found`);
    }

    if (engine.getStatus() === "running") {
      throw new Error(`Cannot remove running engine "${name}". Stop it first.`);
    }

    this.engines.delete(name);
  }

  getEngine(name: string): IEngine | undefined {
    return this.engines.get(name);
  }
}