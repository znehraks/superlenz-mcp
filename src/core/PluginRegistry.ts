/**
 * Plugin registry for managing storage, search, and verification plugins
 */

import type { Plugin, HealthStatus } from './types.js';

export interface PluginRegistryOptions {
  autoSort?: boolean;
}

export class PluginRegistry {
  private plugins: Map<string, Plugin> = new Map();
  private pluginsByType: Map<Plugin['type'], Set<string>> = new Map();
  private autoSort: boolean;

  constructor(options: PluginRegistryOptions = {}) {
    this.autoSort = options.autoSort ?? true;
  }

  /**
   * Register a new plugin
   */
  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin '${plugin.name}' is already registered`);
    }

    this.plugins.set(plugin.name, plugin);

    // Add to type index
    if (!this.pluginsByType.has(plugin.type)) {
      this.pluginsByType.set(plugin.type, new Set());
    }
    this.pluginsByType.get(plugin.type)!.add(plugin.name);
  }

  /**
   * Unregister a plugin
   */
  unregister(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      return false;
    }

    this.plugins.delete(name);

    // Remove from type index
    const typeSet = this.pluginsByType.get(plugin.type);
    if (typeSet) {
      typeSet.delete(name);
      if (typeSet.size === 0) {
        this.pluginsByType.delete(plugin.type);
      }
    }

    return true;
  }

  /**
   * Get a plugin by name
   */
  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Check if a plugin is registered
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Get all plugins of a specific type, sorted by priority
   */
  getByType(type: Plugin['type'], options: {
    enabledOnly?: boolean;
    sortByPriority?: boolean;
  } = {}): Plugin[] {
    const {
      enabledOnly = false,
      sortByPriority = this.autoSort,
    } = options;

    const pluginNames = this.pluginsByType.get(type);
    if (!pluginNames) {
      return [];
    }

    let plugins = Array.from(pluginNames)
      .map(name => this.plugins.get(name)!)
      .filter(plugin => plugin !== undefined);

    // Filter by enabled status
    if (enabledOnly) {
      plugins = plugins.filter(p => p.enabled);
    }

    // Sort by priority (higher priority first)
    if (sortByPriority) {
      plugins.sort((a, b) => {
        // Lower priority number = higher priority (priority 1 before priority 2)
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        // If same priority, sort by name for consistency
        return a.name.localeCompare(b.name);
      });
    }

    return plugins;
  }

  /**
   * Get all plugins
   */
  getAll(options: {
    enabledOnly?: boolean;
    sortByPriority?: boolean;
  } = {}): Plugin[] {
    const {
      enabledOnly = false,
      sortByPriority = false,
    } = options;

    let plugins = Array.from(this.plugins.values());

    if (enabledOnly) {
      plugins = plugins.filter(p => p.enabled);
    }

    if (sortByPriority) {
      plugins.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.name.localeCompare(b.name);
      });
    }

    return plugins;
  }

  /**
   * Enable a plugin
   */
  enable(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      return false;
    }

    plugin.enabled = true;
    return true;
  }

  /**
   * Disable a plugin
   */
  disable(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      return false;
    }

    plugin.enabled = false;
    return true;
  }

  /**
   * Update plugin priority
   */
  setPriority(name: string, priority: number): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      return false;
    }

    plugin.priority = priority;
    return true;
  }

  /**
   * Get plugin count
   */
  count(options: {
    type?: Plugin['type'];
    enabledOnly?: boolean;
  } = {}): number {
    const { type, enabledOnly = false } = options;

    if (type) {
      const plugins = this.getByType(type, { enabledOnly });
      return plugins.length;
    }

    let plugins = Array.from(this.plugins.values());
    if (enabledOnly) {
      plugins = plugins.filter(p => p.enabled);
    }

    return plugins.length;
  }

  /**
   * Check health of all plugins or specific type
   */
  async healthCheck(type?: Plugin['type']): Promise<Map<string, HealthStatus>> {
    const plugins = type
      ? this.getByType(type, { enabledOnly: true })
      : this.getAll({ enabledOnly: true });

    const results = new Map<string, HealthStatus>();

    await Promise.all(
      plugins.map(async plugin => {
        try {
          const status = await plugin.healthCheck();
          results.set(plugin.name, status);
        } catch (error) {
          results.set(plugin.name, {
            healthy: false,
            message: `Health check failed: ${(error as Error).message}`,
            lastCheck: new Date(),
          });
        }
      })
    );

    return results;
  }

  /**
   * Initialize all plugins or plugins of a specific type
   */
  async initializeAll(
    type?: Plugin['type'],
    config?: Record<string, Record<string, unknown>>
  ): Promise<Map<string, { success: boolean; error?: string }>> {
    const plugins = type
      ? this.getByType(type, { enabledOnly: true })
      : this.getAll({ enabledOnly: true });

    const results = new Map<string, { success: boolean; error?: string }>();

    for (const plugin of plugins) {
      try {
        const pluginConfig = config?.[plugin.name] || {};
        await plugin.initialize(pluginConfig);
        results.set(plugin.name, { success: true });
      } catch (error) {
        results.set(plugin.name, {
          success: false,
          error: (error as Error).message,
        });
      }
    }

    return results;
  }

  /**
   * Get statistics about registered plugins
   */
  getStatistics(): {
    total: number;
    byType: Record<Plugin['type'], number>;
    enabled: number;
    disabled: number;
    averagePriority: number;
  } {
    const plugins = Array.from(this.plugins.values());

    const byType: Record<Plugin['type'], number> = {
      storage: 0,
      search: 0,
      verification: 0,
    };

    let enabled = 0;
    let disabled = 0;
    let totalPriority = 0;

    for (const plugin of plugins) {
      byType[plugin.type]++;
      if (plugin.enabled) {
        enabled++;
      } else {
        disabled++;
      }
      totalPriority += plugin.priority;
    }

    return {
      total: plugins.length,
      byType,
      enabled,
      disabled,
      averagePriority: plugins.length > 0 ? totalPriority / plugins.length : 0,
    };
  }

  /**
   * Clear all registered plugins
   */
  clear(): void {
    this.plugins.clear();
    this.pluginsByType.clear();
  }

  /**
   * Export plugin list (for debugging)
   */
  export(): Array<{
    name: string;
    version: string;
    type: Plugin['type'];
    priority: number;
    enabled: boolean;
  }> {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      version: p.version,
      type: p.type,
      priority: p.priority,
      enabled: p.enabled,
    }));
  }

  /**
   * Find plugins matching a predicate
   */
  find(predicate: (plugin: Plugin) => boolean): Plugin[] {
    return Array.from(this.plugins.values()).filter(predicate);
  }

  /**
   * Get the highest priority enabled plugin of a type
   */
  getHighestPriority(type: Plugin['type']): Plugin | undefined {
    const plugins = this.getByType(type, {
      enabledOnly: true,
      sortByPriority: true,
    });

    return plugins[0];
  }
}

// Singleton instance
let instance: PluginRegistry | null = null;

export function getPluginRegistry(options?: PluginRegistryOptions): PluginRegistry {
  if (!instance) {
    instance = new PluginRegistry(options);
  }
  return instance;
}

export function resetPluginRegistry(): void {
  instance = null;
}
