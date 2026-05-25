// Descriptor types come from @cms0/shared; this file extends with CLI-only config.

export type ResolvedConfig = {
  configPath: string;
  entryFile: string;
  projectRoot: string;
  tsconfigPath?: string;
  apiBaseUrl?: string;
  apiKey?: string;
};
