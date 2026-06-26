import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, BootstrapData, ChatRequest, ChatResult, ConversationRecord, ExtensionHealth, KeyPoint, ModelSecretStatus, MoodId, ScreenAnalysisRequest, ScreenAnalysisResult, SystemHealthReport, TtsVoice } from "../shared/types";

const windowKind = ipcRenderer.sendSync("window:get-kind")
  ?? process.argv.find((arg) => arg.startsWith("--elf-window="))?.split("=")[1]
  ?? "companion";

contextBridge.exposeInMainWorld("companionWindowKind", windowKind);

contextBridge.exposeInMainWorld("companionAPI", {
  getBootstrap: (): Promise<BootstrapData> => ipcRenderer.invoke("app:get-bootstrap"),
  getExtensionHealth: (): Promise<ExtensionHealth> => ipcRenderer.invoke("extensions:get-health"),
  saveSettings: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke("settings:save", settings),
  setAlwaysOnTop: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke("window:set-always-on-top", enabled),
  setClickThrough: (enabled: boolean): Promise<void> => ipcRenderer.invoke("window:set-click-through", enabled),
  setHitRegions: (regions: Array<{ x: number; y: number; width: number; height: number }>): Promise<void> => ipcRenderer.invoke("window:set-hit-regions", regions),
  showCompanionMenu: (): Promise<void> => ipcRenderer.invoke("window:show-companion-menu"),
  toggleAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke("window:toggle-always-on-top"),
  showAdmin: (): Promise<void> => ipcRenderer.invoke("window:show-admin"),
  showCompanion: (): Promise<void> => ipcRenderer.invoke("window:show-companion"),
  hideCompanion: (): Promise<void> => ipcRenderer.invoke("window:hide-companion"),
  moveCompanionBy: (deltaX: number, deltaY: number): Promise<void> => ipcRenderer.invoke("window:move-companion-by", deltaX, deltaY),
  setControlsCollapsed: (collapsed: boolean): Promise<{ ok: boolean; collapsed: boolean; width?: number; height?: number }> => ipcRenderer.invoke("window:set-controls-collapsed", collapsed),
  listTtsVoices: (): Promise<TtsVoice[]> => ipcRenderer.invoke("tts:list-voices"),
  speakText: (text: string): Promise<{ ok: boolean; message?: string; audioUrl?: string }> => ipcRenderer.invoke("tts:speak", text),
  stopSpeech: (): Promise<{ ok: boolean }> => ipcRenderer.invoke("tts:stop"),
  captureScreen: (): Promise<{ width: number; height: number; dataUrl: string }> => ipcRenderer.invoke("screen:capture"),
  analyzeScreen: (request?: ScreenAnalysisRequest): Promise<ScreenAnalysisResult> => ipcRenderer.invoke("screen:analyze", request),
  openProjectFolder: (relativePath: string): Promise<string> => ipcRenderer.invoke("system:open-project-folder", relativePath),
  setAutostart: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke("system:set-autostart", enabled),
  refreshPersona: (): Promise<string> => ipcRenderer.invoke("persona:refresh"),
  savePersona: (content: string): Promise<string> => ipcRenderer.invoke("persona:save", content),
  resetPersona: (): Promise<string> => ipcRenderer.invoke("persona:reset"),
  sendMessage: (message: string, mood?: MoodId): Promise<ChatResult> => ipcRenderer.invoke("chat:send", { message, mood } satisfies ChatRequest),
  sendChatRequest: (request: ChatRequest): Promise<ChatResult> => ipcRenderer.invoke("chat:send", request),
  testModelConnection: (): Promise<ChatResult> => ipcRenderer.invoke("model:test-connection"),
  getModelSecretStatus: (): Promise<ModelSecretStatus> => ipcRenderer.invoke("model:get-secret-status"),
  saveModelApiKey: (apiKey: string): Promise<ModelSecretStatus> => ipcRenderer.invoke("model:save-api-key", apiKey),
  saveVisionApiKey: (apiKey: string): Promise<ModelSecretStatus> => ipcRenderer.invoke("model:save-vision-api-key", apiKey),
  getKeyPoints: (): Promise<KeyPoint[]> => ipcRenderer.invoke("memory:get-key-points"),
  getRecentConversations: (): Promise<ConversationRecord[]> => ipcRenderer.invoke("memory:get-recent-conversations"),
  addKeyPoint: (text: string): Promise<KeyPoint> => ipcRenderer.invoke("memory:add-key-point", text),
  deleteKeyPoint: (id: string): Promise<KeyPoint[]> => ipcRenderer.invoke("memory:delete-key-point", id),
  getSystemHealth: (): Promise<SystemHealthReport> => ipcRenderer.invoke("system:get-health"),
  clearLocalData: (): Promise<{ ok: boolean; cleared: string[] }> => ipcRenderer.invoke("system:clear-local-data"),
  factoryReset: (): Promise<{ ok: boolean; reset: string[] }> => ipcRenderer.invoke("system:factory-reset"),
  onSettingsChanged: (callback: (settings: AppSettings) => void) => {
    const listener = (_event: unknown, settings: AppSettings) => callback(settings);
    ipcRenderer.on("settings:changed", listener);
    return () => ipcRenderer.removeListener("settings:changed", listener);
  }
});
