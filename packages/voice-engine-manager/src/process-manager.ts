import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';

export interface ProcessManagerOptions {
  timeout?: number;
  maxStartupTime?: number;
  healthCheckInterval?: number;
}

export class ProcessManager {
  private processes: Map<string, ChildProcess> = new Map();
  private options: Required<ProcessManagerOptions>;

  constructor(options: ProcessManagerOptions = {}) {
    this.options = {
      timeout: options.timeout ?? 5000,
      maxStartupTime: options.maxStartupTime ?? 30000,
      healthCheckInterval: options.healthCheckInterval ?? 1000
    };
  }

  async launchProcess(
    name: string,
    command: string,
    url: string,
    healthEndpoint: string
  ): Promise<void> {
    if (this.processes.has(name)) {
      throw new Error(`Process "${name}" is already running`);
    }

    const parts = command.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);

    const process = spawn(cmd, args, {
      detached: false,
      stdio: 'pipe'
    });

    this.processes.set(name, process);

    process.on('error', (error) => {
      console.error(`Process "${name}" error:`, error);
      this.processes.delete(name);
    });

    process.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Process "${name}" exited with code ${code}`);
      }
      this.processes.delete(name);
    });

    await this.waitForProcessReady(name, url, healthEndpoint);
  }

  async killProcess(name: string): Promise<void> {
    const process = this.processes.get(name);
    if (!process) {
      return;
    }

    return new Promise((resolve) => {
      process.on('exit', () => {
        this.processes.delete(name);
        resolve();
      });

      process.kill('SIGTERM');
      
      setTimeout(() => {
        if (!process.killed) {
          process.kill('SIGKILL');
        }
      }, 5000);
    });
  }

  isProcessRunning(name: string): boolean {
    return this.processes.has(name);
  }

  getProcess(name: string): ChildProcess | undefined {
    return this.processes.get(name);
  }

  async killAllProcesses(): Promise<void> {
    const promises = Array.from(this.processes.keys()).map(name =>
      this.killProcess(name)
    );
    await Promise.all(promises);
  }

  async checkHealth(url: string, endpoint: string): Promise<boolean> {
    try {
      await axios.get(`${url}${endpoint}`, {
        timeout: this.options.timeout
      });
      return true;
    } catch {
      return false;
    }
  }

  async pingWithLatency(url: string, endpoint: string): Promise<{
    online: boolean;
    latency?: number;
    version?: any;
    error?: string;
  }> {
    const startTime = Date.now();
    try {
      const response = await axios.get(`${url}${endpoint}`, {
        timeout: this.options.timeout
      });
      return {
        online: true,
        latency: Date.now() - startTime,
        version: response.data
      };
    } catch (error) {
      return {
        online: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  private async waitForProcessReady(
    name: string,
    url: string,
    healthEndpoint: string
  ): Promise<void> {
    const maxAttempts = Math.floor(this.options.maxStartupTime / this.options.healthCheckInterval);
    
    for (let i = 0; i < maxAttempts; i++) {
      const isReady = await this.checkHealth(url, healthEndpoint);
      if (isReady) {
        return;
      }
      
      if (!this.processes.has(name)) {
        throw new Error(`Process "${name}" exited unexpectedly during startup`);
      }
      
      await new Promise(resolve => 
        setTimeout(resolve, this.options.healthCheckInterval)
      );
    }
    
    throw new Error(
      `Process "${name}" failed to start within ${this.options.maxStartupTime / 1000} seconds`
    );
  }
}