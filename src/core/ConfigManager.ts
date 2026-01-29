/**
 * Configuration manager for loading and managing server configuration
 * Supports environment variable substitution: ${VAR_NAME} or ${VAR_NAME:-default}
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ConfigOptions {
  configDir?: string;
  env?: Record<string, string | undefined>;
}

export class ConfigManager {
  private configs: Map<string, unknown> = new Map();
  private configDir: string;
  private env: Record<string, string | undefined>;

  constructor(options: ConfigOptions = {}) {
    this.configDir = options.configDir || path.join(__dirname, '../../config');
    this.env = options.env || process.env;
  }

  /**
   * Load a configuration file by name
   */
  async loadConfig(name: string): Promise<unknown> {
    if (this.configs.has(name)) {
      return this.configs.get(name);
    }

    const configPath = path.join(this.configDir, `${name}.json`);

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(content);
      const substituted = this.substituteEnvVars(parsed);

      this.configs.set(name, substituted);
      return substituted;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Configuration file not found: ${configPath}`);
      }
      throw new Error(`Failed to load configuration '${name}': ${(error as Error).message}`);
    }
  }

  /**
   * Get a specific configuration value by path (e.g., "providers.markdown.enabled")
   */
  async getConfigValue<T>(configName: string, path: string): Promise<T | undefined> {
    const config = await this.loadConfig(configName);
    return this.getNestedValue(config, path) as T | undefined;
  }

  /**
   * Reload a specific configuration (useful for hot-reloading)
   */
  async reloadConfig(name: string): Promise<void> {
    this.configs.delete(name);
    await this.loadConfig(name);
  }

  /**
   * Reload all configurations
   */
  async reloadAll(): Promise<void> {
    const names = Array.from(this.configs.keys());
    this.configs.clear();
    await Promise.all(names.map(name => this.loadConfig(name)));
  }

  /**
   * Substitute environment variables in a value
   * Supports: ${VAR_NAME} and ${VAR_NAME:-default_value}
   */
  private substituteEnvVars(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.substituteString(value);
    }

    if (Array.isArray(value)) {
      return value.map(item => this.substituteEnvVars(item));
    }

    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.substituteEnvVars(val);
      }
      return result;
    }

    return value;
  }

  /**
   * Substitute environment variables in a string
   */
  private substituteString(str: string): string {
    // Match ${VAR_NAME} or ${VAR_NAME:-default}
    const regex = /\$\{([^}:]+)(?::-((?:[^}\\]|\\.)*))?\}/g;

    return str.replace(regex, (_match, varName, defaultValue) => {
      const envValue = this.env[varName];

      if (envValue !== undefined) {
        return envValue;
      }

      if (defaultValue !== undefined) {
        // Unescape any escaped characters in default value
        return defaultValue.replace(/\\(.)/g, '$1');
      }

      // If no value and no default, return empty string (or keep the placeholder)
      return '';
    });
  }

  /**
   * Get nested value from object by dot-separated path
   */
  private getNestedValue(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== 'object') {
      return undefined;
    }

    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Check if a configuration is loaded
   */
  hasConfig(name: string): boolean {
    return this.configs.has(name);
  }

  /**
   * Get all loaded configuration names
   */
  getLoadedConfigs(): string[] {
    return Array.from(this.configs.keys());
  }

  /**
   * Clear all cached configurations
   */
  clear(): void {
    this.configs.clear();
  }

  /**
   * Get the configuration directory path
   */
  getConfigDir(): string {
    return this.configDir;
  }

  /**
   * List available configuration files in the config directory
   */
  async listAvailableConfigs(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.configDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch (error) {
      throw new Error(`Failed to list configurations: ${(error as Error).message}`);
    }
  }

  /**
   * Validate that required environment variables are set
   */
  validateRequiredEnvVars(required: string[]): void {
    const missing = required.filter(varName => !this.env[varName]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(', ')}\n` +
        `Please check your .env file or environment configuration.`
      );
    }
  }

  /**
   * Get environment variable with optional default
   */
  getEnv(varName: string, defaultValue?: string): string | undefined {
    return this.env[varName] ?? defaultValue;
  }

  /**
   * Check if an environment variable is set
   */
  hasEnv(varName: string): boolean {
    return varName in this.env && this.env[varName] !== undefined && this.env[varName] !== '';
  }
}

// Singleton instance
let instance: ConfigManager | null = null;

export function getConfigManager(options?: ConfigOptions): ConfigManager {
  if (!instance) {
    instance = new ConfigManager(options);
  }
  return instance;
}

export function resetConfigManager(): void {
  instance = null;
}
