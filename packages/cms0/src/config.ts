export type Cms0Config = {
  /**
   * Path to the file that calls cms0<T>(), relative to this config file.
   */
  entry: string;
  /**
   * Optional path to tsconfig to use for type analysis, relative to this config file.
   * If omitted, the CLI will walk up from the entry file to find a tsconfig.json.
   */
  tsconfig?: string;
  /**
   * Optional API configuration. Used by the SDK as a default and by the generator
   * to publish descriptors to the admin API.
   */
  api: Cms0APIConfig;
};

export type Cms0APIConfig = {
  baseUrl?: string; // e.g., http://localhost:4000/api/content
  key?: string;
};

export function defineConfig(config: Cms0Config): Cms0Config {
  return config;
}
