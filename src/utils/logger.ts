/**
 * Ultrathink Logger - Advanced logging utility for MCP TTS Server
 * Features:
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR)
 * - Structured logging with timestamps and metadata
 * - Performance tracking for "thinking" operations
 * - Colored output for better readability
 * - Environment-based configuration
 */

import { isatty } from 'tty';
import { inspect } from 'util';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4
}

export interface LogContext {
  [key: string]: any;
}

export interface ThinkingMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  operation: string;
  success?: boolean;
  metadata?: LogContext;
}

interface LoggerConfig {
  level: LogLevel;
  colorize: boolean;
  timestamp: boolean;
  json: boolean;
  stream: NodeJS.WritableStream;
}

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
} as const;

class UltrathinkLogger {
  private config: LoggerConfig;
  private thinkingStack: Map<string, ThinkingMetrics> = new Map();

  constructor(config?: Partial<LoggerConfig>) {
    const defaultColorize = process.env.LOG_COLOR !== 'false' && 
      process.stderr && 
      'fd' in process.stderr && 
      isatty(process.stderr.fd);
      
    this.config = {
      level: this.parseLogLevel(process.env.LOG_LEVEL || 'INFO'),
      colorize: defaultColorize,
      timestamp: process.env.LOG_TIMESTAMP !== 'false',
      json: process.env.LOG_FORMAT === 'json',
      stream: process.stderr,
      ...config
    };
  }

  private parseLogLevel(level: string): LogLevel {
    const upperLevel = level.toUpperCase();
    return LogLevel[upperLevel as keyof typeof LogLevel] ?? LogLevel.INFO;
  }

  private getLevelName(level: LogLevel): string {
    return LogLevel[level] || 'UNKNOWN';
  }

  private colorize(text: string, color: keyof typeof COLORS): string {
    if (!this.config.colorize) return text;
    return `${COLORS[color]}${text}${COLORS.reset}`;
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    if (this.config.json) {
      const log = {
        timestamp: this.config.timestamp ? this.formatTimestamp() : undefined,
        level: this.getLevelName(level),
        message,
        ...context
      };
      return JSON.stringify(log);
    }

    const parts: string[] = [];

    if (this.config.timestamp) {
      parts.push(this.colorize(`[${this.formatTimestamp()}]`, 'gray'));
    }

    const levelColors: Record<LogLevel, keyof typeof COLORS> = {
      [LogLevel.DEBUG]: 'cyan',
      [LogLevel.INFO]: 'blue',
      [LogLevel.WARN]: 'yellow',
      [LogLevel.ERROR]: 'red',
      [LogLevel.SILENT]: 'gray'
    };

    const levelColor = levelColors[level] || 'gray';
    const levelName = this.getLevelName(level).padEnd(5);
    parts.push(this.colorize(`[${levelName}]`, levelColor));

    parts.push(message);

    if (context && Object.keys(context).length > 0) {
      const contextStr = inspect(context, { 
        colors: this.config.colorize, 
        depth: 3,
        compact: true
      });
      parts.push(this.colorize(contextStr, 'dim'));
    }

    return parts.join(' ');
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (level < this.config.level) return;

    const formatted = this.formatMessage(level, message, context);
    this.config.stream.write(formatted + '\n');
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context);
  }

  /**
   * Start tracking a thinking operation
   */
  startThinking(operation: string, metadata?: LogContext): string {
    const id = `think-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const metrics: ThinkingMetrics = {
      startTime: Date.now(),
      operation,
      metadata
    };
    
    this.thinkingStack.set(id, metrics);
    this.debug(`🧠 Starting thinking: ${operation}`, { thinkId: id, ...metadata });
    
    return id;
  }

  /**
   * End tracking a thinking operation
   */
  endThinking(id: string, success: boolean = true, result?: any): ThinkingMetrics | undefined {
    const metrics = this.thinkingStack.get(id);
    if (!metrics) {
      this.warn(`Thinking operation not found: ${id}`);
      return undefined;
    }

    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    metrics.success = success;

    const emoji = success ? '✅' : '❌';
    const context: LogContext = {
      thinkId: id,
      duration: `${metrics.duration}ms`,
      ...metrics.metadata
    };

    if (result !== undefined) {
      context.result = result;
    }

    this.debug(
      `${emoji} Completed thinking: ${metrics.operation}`,
      context
    );

    this.thinkingStack.delete(id);
    return metrics;
  }

  /**
   * Log a thinking operation with automatic timing
   */
  async think<T>(
    operation: string,
    fn: () => Promise<T> | T,
    metadata?: LogContext
  ): Promise<T> {
    const id = this.startThinking(operation, metadata);
    
    try {
      const result = await fn();
      this.endThinking(id, true, result);
      return result;
    } catch (error) {
      this.endThinking(id, false, error);
      throw error;
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): UltrathinkLogger {
    const childLogger = new UltrathinkLogger(this.config);
    const originalLog = childLogger.log.bind(childLogger);
    
    childLogger.log = (level: LogLevel, message: string, ctx?: LogContext) => {
      originalLog(level, message, { ...context, ...ctx });
    };
    
    return childLogger;
  }

  /**
   * Update logger configuration
   */
  setConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<LoggerConfig> {
    return { ...this.config };
  }

  /**
   * Check if a log level is enabled
   */
  isLevelEnabled(level: LogLevel): boolean {
    return level >= this.config.level;
  }
}

// Create singleton instance
export const logger = new UltrathinkLogger();

// Export bound methods for convenience
export const debug = logger.debug.bind(logger);
export const info = logger.info.bind(logger);
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);
export const startThinking = logger.startThinking.bind(logger);
export const endThinking = logger.endThinking.bind(logger);
export const think = logger.think.bind(logger);
export const child = logger.child.bind(logger);

// Export the class for testing
export { UltrathinkLogger };

// Re-export the logger instance as default
export default logger;