declare const process: {
  env: Record<string, string | undefined>;
  platform: string;
  cwd: () => string;
};

declare module "node:child_process" {
  export function execFile(
    command: string,
    args: string[],
    options: {
      cwd?: string;
      maxBuffer?: number;
      timeout?: number;
      windowsHide?: boolean;
    },
    callback: (
      error: (Error & { code?: string; signal?: string }) | null,
      stdout: string,
      stderr: string
    ) => void
  ): void;
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readdirSync(
    path: string,
    options?: { withFileTypes?: boolean }
  ): unknown[];
  export function statSync(path: string): {
    isDirectory: () => boolean;
  };
}

declare module "node:path" {
  export function basename(path: string): string;
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}
