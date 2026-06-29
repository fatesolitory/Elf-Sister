import type { AppSettings, BootstrapData, ChatRequest, ChatResult, ConversationRecord, ExtensionHealth, KeyPoint, ModelSecretStatus, MoodId, ScreenAnalysisRequest, ScreenAnalysisResult, SystemHealthReport, TtsVoice } from "../shared/types";

declare global {
  interface Window {
    companionWindowKind?: "companion" | "toggle" | "admin";
    companionAPI: {
      getBootstrap: () => Promise<BootstrapData>;
      getExtensionHealth: () => Promise<ExtensionHealth>;
      saveSettings: (settings: AppSettings) => Promise<AppSettings>;
      setAlwaysOnTop: (enabled: boolean) => Promise<boolean>;
      setClickThrough: (enabled: boolean) => Promise<void>;
      setHitRegions: (regions: Array<{ x: number; y: number; width: number; height: number; role?: "visual" | "control" }>) => Promise<void>;
      showCompanionMenu: () => Promise<void>;
      toggleAlwaysOnTop: () => Promise<boolean>;
      showAdmin: () => Promise<void>;
      showCompanion: () => Promise<void>;
      hideCompanion: () => Promise<void>;
      moveCompanionBy: (deltaX: number, deltaY: number) => Promise<void>;
      setControlsCollapsed: (collapsed: boolean) => Promise<{ ok: boolean; collapsed: boolean; width?: number; height?: number }>;
      listTtsVoices: () => Promise<TtsVoice[]>;
      speakText: (text: string) => Promise<{ ok: boolean; message?: string; audioUrl?: string }>;
      stopSpeech: () => Promise<{ ok: boolean }>;
      captureScreen: () => Promise<{ width: number; height: number; dataUrl: string }>;
      analyzeScreen: (request?: ScreenAnalysisRequest) => Promise<ScreenAnalysisResult>;
      openProjectFolder: (relativePath: string) => Promise<string>;
      setAutostart: (enabled: boolean) => Promise<boolean>;
      refreshPersona: () => Promise<string>;
      savePersona: (content: string) => Promise<string>;
      resetPersona: () => Promise<string>;
      sendMessage: (message: string, mood?: MoodId) => Promise<ChatResult>;
      sendChatRequest: (request: ChatRequest) => Promise<ChatResult>;
      testModelConnection: () => Promise<ChatResult>;
      getModelSecretStatus: () => Promise<ModelSecretStatus>;
      saveModelApiKey: (apiKey: string) => Promise<ModelSecretStatus>;
      saveVisionApiKey: (apiKey: string) => Promise<ModelSecretStatus>;
      getKeyPoints: () => Promise<KeyPoint[]>;
      getRecentConversations: () => Promise<ConversationRecord[]>;
      addKeyPoint: (text: string) => Promise<KeyPoint>;
      deleteKeyPoint: (id: string) => Promise<KeyPoint[]>;
      getSystemHealth: () => Promise<SystemHealthReport>;
      clearLocalData: () => Promise<{ ok: boolean; cleared: string[] }>;
      factoryReset: () => Promise<{ ok: boolean; reset: string[] }>;
      onSettingsChanged: (callback: (settings: AppSettings) => void) => () => void;
    };
  }
}
