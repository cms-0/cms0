export type PushOutputState = {
  handledColumnPrompts: number;
  handledRenamePrompts: number;
  handledTruncatePrompts: number;
  output: string;
};

export const stripAnsi = (output: string): string =>
  output
    .replace(/\][^]*(?:|\\)/g, "")
    .replace(/\[[0-?]*[ -/]*[@-~]/g, "");

export const hasFatalOutput = (output: string): boolean => {
  const patterns = [
    /^\s*error:\s+/gim,
    /\bseverity:\s*['"]?ERROR['"]?/gi,
    /\bPostgresError\b/gi,
  ];
  return patterns.some((pattern) => pattern.test(output));
};

export const hasInteractivePrompt = (output: string): boolean => {
  const prompts = [
    /created or renamed from another \w+\?/i,
    /column in .* table created or renamed from another column\?/i,
    /Do you want to truncate/i,
    /requires? a TTY terminal/i,
    /Enter /i,
  ];
  return prompts.some((pattern) => pattern.test(output));
};

export const hasTtyRequirementFailure = (output: string): boolean =>
  /requires? a TTY terminal|tcgetattr\/ioctl/i.test(output);

export const createPushOutputState = (): PushOutputState => ({
  handledColumnPrompts: 0,
  handledRenamePrompts: 0,
  handledTruncatePrompts: 0,
  output: "",
});

export const appendOutput = (state: PushOutputState, chunk: string): void => {
  state.output += stripAnsi(chunk);
};

export const autoResolvePrompts = (
  state: PushOutputState,
  writeInput: (input: string) => void,
): void => {
  const renameCount =
    state.output.match(/created or renamed from another \w+\?/gi)?.length ?? 0;
  while (state.handledRenamePrompts < renameCount) {
    state.handledRenamePrompts += 1;
    writeInput("\r");
  }

  const columnCount =
    state.output.match(
      /column in .* table created or renamed from another column\?/gi,
    )?.length ?? 0;
  while (state.handledColumnPrompts < columnCount) {
    state.handledColumnPrompts += 1;
    writeInput("\r");
  }

  const truncateCount =
    state.output.match(/Do you want to truncate/i)?.length ?? 0;
  while (state.handledTruncatePrompts < truncateCount) {
    state.handledTruncatePrompts += 1;
    writeInput("n\r");
  }
};
