import { Menu, Tray, type NativeImage } from "electron";

let tray: Tray | undefined;

export function createTray(options: {
  icon: NativeImage;
  onOpenUserData: () => void;
  onQuit: () => void;
  onShow: () => void;
}): Tray {
  tray = new Tray(options.icon.resize({ width: 20, height: 20 }));
  tray.setToolTip("Cognitive Workstation");
  tray.on("click", options.onShow);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示工作站", click: options.onShow },
      { label: "打开数据目录", click: options.onOpenUserData },
      { type: "separator" },
      { label: "退出", click: options.onQuit }
    ])
  );
  return tray;
}
