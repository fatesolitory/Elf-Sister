export type CoreMoodId = "idle" | "happy" | "shy" | "care" | "encourage" | "sleepy";
export type MoodId = CoreMoodId | (string & {});
export type AvatarRenderer = "static" | "gif" | "live2d";
export type ModelProvider =
  | "mock"
  | "openai"
  | "minimax"
  | "deepseek"
  | "qwen"
  | "zhipu"
  | "moonshot"
  | "siliconflow"
  | "openai-compatible"
  | "ollama"
  | "lmstudio"
  | "custom";

export interface Costume {
  id: string;
  name: string;
  description: string;
  packId: string;
  enabled: boolean;
  tags: string[];
  modelHint?: string;
  stylePrompt?: string;
}

export interface Mood {
  id: MoodId;
  name: string;
  bubble: string;
  modelHint?: string;
  expressionPrompt?: string;
}

export interface BubbleAsset {
  id: string;
  name: string;
  file: string;
}

export interface CostumePack {
  id: string;
  name: string;
  version: string;
  author: string;
  root: string;
  enabled: boolean;
  description: string;
  costumeIds: string[];
}

export interface Live2DModelConfig {
  id: string;
  name: string;
  modelJson: string;
  enabled: boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
  defaultExpression?: string;
  motions: Record<string, string>;
  expressions: Record<string, string>;
}

export interface GifAnimationConfig {
  id: string;
  name: string;
  file: string;
  enabled: boolean;
  mood?: MoodId;
  costumeId?: string;
  loop: boolean;
  fps?: number;
}

export interface AssetManifest {
  schemaVersion: number;
  activeRenderer: AvatarRenderer;
  costumes: Costume[];
  moods: Mood[];
  bubbles: BubbleAsset[];
  costumePacks: CostumePack[];
  live2dModels: Live2DModelConfig[];
  gifAnimations: GifAnimationConfig[];
  defaultAvatar: string;
  avatarPathPattern: string;
  generatedAvatarPathPattern: string;
  avatarOverrides: Record<string, string>;
}

export interface AssetPackManifest {
  schemaVersion: number;
  costumePack: CostumePack;
  costumes?: Costume[];
  moods?: Mood[];
  bubbles?: BubbleAsset[];
  avatarOverrides?: Record<string, string>;
  live2dModels?: Live2DModelConfig[];
  gifAnimations?: GifAnimationConfig[];
  modelIntegration?: {
    styleId?: string;
    promptHint?: string;
    allowedMoodIds?: string[];
    allowedCostumeIds?: string[];
  };
}

export interface ReminderConfig {
  enabled: boolean;
  minutes: number;
  message?: string;
  mood?: MoodId;
}

export interface ReminderMessage {
  label: string;
  message: string;
  mood: MoodId;
}

export interface IdleBubble {
  id: string;
  text: string;
  mood: MoodId;
}

export interface ProactiveBubbleSettings {
  enabled: boolean;
  minutes: number;
  minIdleMinutes: number;
}

export interface ModelConfig {
  enabled: boolean;
  provider: ModelProvider;
  url?: string;
  baseURL: string;
  /** Deprecated: kept for backward compatibility. Store new API keys in data/model-secrets.json. */
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  contextLength: number;
  injectPersona: boolean;
  requestLogging: boolean;
  systemPromptTemplate: string;
  timeoutMs: number;
}

export interface ExtensionSettings {
  activeRenderer: AvatarRenderer;
  activeCostumePack: string;
  activeLive2DModel?: string;
  activeGifAnimation?: string;
  preferGeneratedAvatars: boolean;
}

export type TtsProvider = "minimax" | "openai" | "azure" | "elevenlabs" | "doubao" | "aliyun" | "tencent" | "xunfei" | "custom";
export type ScreenAwarenessMode = "manual" | "interval";
export type ScreenAwarenessProviderMode = "reuse-model" | "separate-vision";

export interface TtsAddonSettings {
  enabled: boolean;
  provider: TtsProvider;
  localEnabled: boolean;
  voice: string;
  rate: number;
  pitch: number;
  volume: number;
  model: string;
  emotion: string;
  languageBoost: string;
  audioFormat: "mp3" | "wav" | "flac" | "pcm" | "opus" | "pcmu_raw" | "pcmu_wav";
  sampleRate: number;
  bitrate: number;
  channel: 1 | 2;
  remoteUrl: string;
  remoteMethod: "POST" | "GET";
  remoteApiKey: string;
  remoteAuthHeader: string;
  remoteContentType: string;
  remoteBodyTemplate: string;
  remoteAudioField: string;
  speakLocalReplies: boolean;
  speakModelReplies: boolean;
  interruptOnNewReply: boolean;
  maxChars: number;
  minIntervalMs: number;
  cacheEnabled: boolean;
}

export interface ScreenAwarenessSettings {
  enabled: boolean;
  mode: ScreenAwarenessMode;
  intervalSeconds: number;
  providerMode: ScreenAwarenessProviderMode;
  visionModel: ModelConfig;
  prompt: string;
  maxImageWidth: number;
  includeCursor: boolean;
}

export interface AddonSettings {
  tts: TtsAddonSettings;
  screenAwareness: ScreenAwarenessSettings;
}

export interface IdentitySettings {
  characterName: string;
  selfReference: string;
  userAddress: string;
}

export interface AppSettings {
  selectedCostume: string;
  selectedMood: MoodId;
  selectedBubble: string;
  alwaysOnTop: boolean;
  opacity: number;
  scale: number;
  bubbleFontSize: number;
  bubbleScrollSpeed: number;
  locked: boolean;
  visibleOnStart: boolean;
  startAlwaysOnTop: boolean;
  edgeSnap: boolean;
  autostart: boolean;
  workMode: boolean;
  companionMode: boolean;
  saveConversations: boolean;
  proactiveBubbles: ProactiveBubbleSettings;
  identity: IdentitySettings;
  extensions: ExtensionSettings;
  addons: AddonSettings;
  reminders: Record<string, ReminderConfig>;
  model: ModelConfig;
}

export interface BootstrapData {
  assets: AssetManifest;
  settings: AppSettings;
  persona: string;
  replies: Record<string, string[]>;
  replyRules: ReplyRule[];
  reminderMessages: Record<string, ReminderMessage>;
  idleBubbles: IdleBubble[];
  appPath: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  message: string;
  mood?: MoodId;
  history?: ChatMessage[];
  allowLocalFallback?: boolean;
}

export interface ChatResult {
  text: string;
  source: "mock" | "model";
  mood: MoodId;
  provider: ModelProvider;
  category?: string;
  details?: Record<string, unknown>;
}

export interface TtsVoice {
  id: string;
  name: string;
  culture?: string;
}

export interface ScreenAnalysisResult extends ChatResult {
  screenshot?: {
    width: number;
    height: number;
  };
}

export interface ScreenAnalysisRequest {
  trigger?: "manual" | "auto";
  context?: {
    userAddress?: string;
    characterName?: string;
    selfReference?: string;
    mood?: MoodId;
    moodName?: string;
    costumeId?: string;
    costumeName?: string;
    bubbleId?: string;
    workMode?: boolean;
    companionMode?: boolean;
  };
}

export interface ConversationRecord {
  id: string;
  timestamp: string;
  input: string;
  output: string;
  category: string;
  mood: MoodId;
  provider: ModelProvider;
  source: "mock" | "model";
}

export interface KeyPoint {
  id: string;
  timestamp: string;
  title: string;
  summary: string;
  tags: string[];
  source: "manual" | "chat" | "model";
  importance?: number;
  important?: boolean;
}

export type HealthStatus = "ok" | "warning" | "error";

export interface HealthCheckItem {
  id: string;
  label: string;
  status: HealthStatus;
  message: string;
  details?: Record<string, unknown>;
  suggestion?: string;
}

export interface SystemHealthReport {
  status: HealthStatus;
  checkedAt: string;
  summary: Record<string, number | string | boolean>;
  items: HealthCheckItem[];
}

export interface AppEventLogRecord {
  timestamp: string;
  level: "info" | "warning" | "error";
  event: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ModelSecretStatus {
  hasApiKey: boolean;
  hasVisionApiKey: boolean;
}

export interface ReplyRule {
  id: string;
  label: string;
  priority: number;
  mood: MoodId;
  keywords: string[];
}

export interface ExtensionHealth {
  costumePacks: { total: number; enabled: number };
  live2dModels: { total: number; enabled: number };
  gifAnimations: { total: number; enabled: number };
  generatedAvatars: { existing: number; expected: number };
}
