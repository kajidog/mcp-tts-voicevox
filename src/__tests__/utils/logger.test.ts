import { logger, LogLevel, startThinking, endThinking, think } from '../../utils/logger';
import { Writable } from 'stream';

describe('UltrathinkLogger', () => {
  let mockStream: Writable;
  let output: string[];

  beforeEach(() => {
    output = [];
    mockStream = new Writable({
      write(chunk: any, encoding: any, callback: any) {
        output.push(chunk.toString());
        callback();
      }
    });

    // Reset logger config for each test
    logger.setConfig({
      level: LogLevel.DEBUG,
      colorize: false,
      timestamp: false,
      json: false,
      stream: mockStream
    });
  });

  describe('Basic logging', () => {
    it('should log debug messages', () => {
      logger.debug('Debug message');
      expect(output[0]).toBe('[DEBUG] Debug message\n');
    });

    it('should log info messages', () => {
      logger.info('Info message');
      expect(output[0]).toBe('[INFO ] Info message\n');
    });

    it('should log warn messages', () => {
      logger.warn('Warning message');
      expect(output[0]).toBe('[WARN ] Warning message\n');
    });

    it('should log error messages', () => {
      logger.error('Error message');
      expect(output[0]).toBe('[ERROR] Error message\n');
    });

    it('should log messages with context', () => {
      logger.info('Message with context', { user: 'test', id: 123 });
      expect(output[0]).toContain('[INFO ] Message with context');
      expect(output[0]).toContain("user: 'test'");
      expect(output[0]).toContain('id: 123');
    });
  });

  describe('Log levels', () => {
    it('should respect log level settings', () => {
      logger.setConfig({ level: LogLevel.WARN });
      
      logger.debug('Debug - should not appear');
      logger.info('Info - should not appear');
      logger.warn('Warning - should appear');
      logger.error('Error - should appear');

      expect(output.length).toBe(2);
      expect(output[0]).toContain('Warning - should appear');
      expect(output[1]).toContain('Error - should appear');
    });

    it('should handle SILENT level', () => {
      logger.setConfig({ level: LogLevel.SILENT });
      
      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warning');
      logger.error('Error');

      expect(output.length).toBe(0);
    });
  });

  describe('JSON formatting', () => {
    beforeEach(() => {
      logger.setConfig({ json: true, timestamp: false });
    });

    it('should output JSON format', () => {
      logger.info('JSON message', { key: 'value' });
      const log = JSON.parse(output[0]);
      
      expect(log.level).toBe('INFO');
      expect(log.message).toBe('JSON message');
      expect(log.key).toBe('value');
    });

    it('should include timestamp when enabled', () => {
      logger.setConfig({ json: true, timestamp: true });
      logger.info('Message with timestamp');
      
      const log = JSON.parse(output[0]);
      expect(log.timestamp).toBeDefined();
      expect(new Date(log.timestamp).getTime()).toBeCloseTo(Date.now(), -2);
    });
  });

  describe('Thinking operations', () => {
    it('should track thinking operations', () => {
      const id = startThinking('Processing data', { items: 10 });
      expect(id).toMatch(/^think-\d+-[a-z0-9]+$/);
      
      // Should log start
      expect(output[0]).toContain('Starting thinking: Processing data');
      expect(output[0]).toContain('items: 10');

      // Simulate some work
      const startTime = Date.now();
      while (Date.now() - startTime < 10) {
        // busy wait
      }

      const metrics = endThinking(id, true, { result: 'success' });
      
      expect(metrics).toBeDefined();
      expect(metrics!.operation).toBe('Processing data');
      expect(metrics!.duration).toBeGreaterThan(0);
      expect(metrics!.success).toBe(true);
      
      // Should log completion
      expect(output[1]).toContain('Completed thinking: Processing data');
      expect(output[1]).toContain('duration:');
      expect(output[1]).toContain("result: 'success'");
    });

    it('should handle failed thinking operations', () => {
      const id = startThinking('Failed operation');
      const metrics = endThinking(id, false, new Error('Test error'));
      
      expect(metrics!.success).toBe(false);
      expect(output[1]).toContain('❌');
    });

    it('should handle async think operations', async () => {
      const result = await think(
        'Async operation',
        async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return 'async result';
        },
        { type: 'async' }
      );

      expect(result).toBe('async result');
      expect(output[0]).toContain('Starting thinking: Async operation');
      expect(output[1]).toContain('Completed thinking: Async operation');
    });

    it('should handle think operation errors', async () => {
      await expect(
        think('Error operation', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      expect(output[1]).toContain('❌');
    });
  });

  describe('Child loggers', () => {
    it('should create child logger with additional context', () => {
      const childLogger = logger.child({ service: 'test-service', version: '1.0' });
      
      childLogger.info('Child message', { extra: 'data' });
      
      expect(output[0]).toContain('Child message');
      expect(output[0]).toContain("service: 'test-service'");
      expect(output[0]).toContain("version: '1.0'");
      expect(output[0]).toContain("extra: 'data'");
    });
  });

  describe('Configuration', () => {
    it('should check if level is enabled', () => {
      logger.setConfig({ level: LogLevel.WARN });
      
      expect(logger.isLevelEnabled(LogLevel.DEBUG)).toBe(false);
      expect(logger.isLevelEnabled(LogLevel.INFO)).toBe(false);
      expect(logger.isLevelEnabled(LogLevel.WARN)).toBe(true);
      expect(logger.isLevelEnabled(LogLevel.ERROR)).toBe(true);
    });

    it('should get current configuration', () => {
      logger.setConfig({
        level: LogLevel.INFO,
        colorize: true,
        timestamp: true,
        json: false
      });

      const config = logger.getConfig();
      expect(config.level).toBe(LogLevel.INFO);
      expect(config.colorize).toBe(true);
      expect(config.timestamp).toBe(true);
      expect(config.json).toBe(false);
    });
  });

  describe('Environment variables', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should parse LOG_LEVEL from environment', () => {
      process.env.LOG_LEVEL = 'WARN';
      const { UltrathinkLogger } = require('../../utils/logger');
      const testLogger = new UltrathinkLogger();
      
      expect(testLogger.getConfig().level).toBe(LogLevel.WARN);
    });

    it('should handle invalid LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'INVALID';
      const { UltrathinkLogger } = require('../../utils/logger');
      const testLogger = new UltrathinkLogger();
      
      expect(testLogger.getConfig().level).toBe(LogLevel.INFO);
    });

    it('should parse LOG_FORMAT for JSON', () => {
      process.env.LOG_FORMAT = 'json';
      const { UltrathinkLogger } = require('../../utils/logger');
      const testLogger = new UltrathinkLogger();
      
      expect(testLogger.getConfig().json).toBe(true);
    });

    it('should parse LOG_TIMESTAMP', () => {
      process.env.LOG_TIMESTAMP = 'false';
      const { UltrathinkLogger } = require('../../utils/logger');
      const testLogger = new UltrathinkLogger();
      
      expect(testLogger.getConfig().timestamp).toBe(false);
    });
  });
});