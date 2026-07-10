import { globalShortcut } from "electron";

export function registerGlobalShortcuts(actions: {
  onToggleWindow: () => void;
  onTimerToggle: () => void;
  onTimerStop: () => void;
  onMusicToggle: () => void;
}): string[] {
  const bindings = [
    ["CommandOrControl+Alt+H", actions.onToggleWindow],
    ["CommandOrControl+Alt+Space", actions.onTimerToggle],
    ["CommandOrControl+Alt+S", actions.onTimerStop],
    ["CommandOrControl+Alt+P", actions.onMusicToggle]
  ] as const;
  return bindings.filter(([accelerator, action]) => !globalShortcut.register(accelerator, action)).map(([accelerator]) => accelerator);
}
