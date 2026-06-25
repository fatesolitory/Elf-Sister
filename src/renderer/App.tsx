import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BookOpen,
  Bot,
  Eye,
  EyeOff,
  FolderOpen,
  Heart,
  Layers,
  MessageCircle,
  MonitorUp,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Square,
  Sparkles,
  Trash2,
  Volume2
} from "lucide-react";
import type { AppSettings, AssetManifest, AvatarRenderer, BootstrapData, ChatMessage, ChatResult, ConversationRecord, ExtensionHealth, HealthStatus, KeyPoint, ModelProvider, ModelSecretStatus, MoodId, ScreenAnalysisRequest, ScreenAnalysisResult, SystemHealthReport, TtsVoice } from "../shared/types";
import "./styles/app.css";

const params = new URLSearchParams(window.location.search);
const windowKind = window.companionWindowKind ?? params.get("window") ?? "companion";
const CHAT_TIMEOUT_MS = 30000;
const APP_VERSION = "26.06.24.1.7";
const ALPHA_HIT_THRESHOLD = 8;
const DEFAULT_BUBBLE_SCROLL_SPEED = 0.05;
const BUBBLE_WHEEL_DELTA_UNIT = 100;
const BUBBLE_WHEEL_MIN_INTERVAL_MS = 80;
const BUBBLE_SCROLL_SPEED_FACTOR_RANGE = { min: 0.1, max: 10 };
const TTS_AUDIO_START_DELAY_MS = 120;
const SILENT_WAV_DATA_URL = "data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAA==";
const BACKGROUND_STORY = [
  "她原本生活在一个由星光、书页和微小魔法组成的异世界。那里每个陪伴精灵都会寻找一位需要被守护的人，把他的桌面、心情和日常当作自己的小小领地。",
  "某天，星轨偏移，一道通往现实世界的光落进了哥哥的屏幕。她就这样穿过裂隙，带着还没完全收好的魔法行李，轻轻降落在桌面一角。",
  "她不太懂这个世界的全部规则，却很快学会了陪哥哥工作、学习、休息，也学会了在哥哥累的时候小声提醒，在哥哥开心的时候认真庆祝。",
  "从那以后，她决定留在这里。不是作为冰冷的程序，而是作为桌面边上那个会回应、会陪伴、会慢慢理解哥哥的小小妹妹。"
];

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(resolve, reject).finally(() => window.clearTimeout(timer));
  });
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function assetUrl(relativePath: string, appPath: string) {
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return `/${relativePath.replace(/\\/g, "/")}`;
  }
  const normalized = `${appPath}/${relativePath}`.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  return encodeURI(`file:///${normalized.replace(/^\/+/, "")}`);
}

function resolveAvatarPath(assets: AssetManifest, settings: AppSettings) {
  const key = `${settings.selectedCostume}_${settings.selectedMood}`;
  if (assets.avatarOverrides[key]) return assets.avatarOverrides[key];
  if (settings.extensions.preferGeneratedAvatars) {
    return assets.generatedAvatarPathPattern.replace("{costume}", settings.selectedCostume).replace("{mood}", settings.selectedMood);
  }
  return assets.avatarPathPattern.replace("{costume}", settings.selectedCostume).replace("{mood}", settings.selectedMood);
}

function resolveFallbackAvatarPath(assets: AssetManifest, settings: AppSettings) {
  return assets.avatarPathPattern.replace("{costume}", settings.selectedCostume).replace("{mood}", settings.selectedMood);
}

function waitForAudioReady(audio: HTMLAudioElement) {
  if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      audio.removeEventListener("canplay", finish);
      audio.removeEventListener("loadeddata", finish);
      audio.removeEventListener("error", finish);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, 1200);
    audio.addEventListener("canplay", finish, { once: true });
    audio.addEventListener("loadeddata", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    audio.load();
  });
}

async function warmUpAudioOutput() {
  const warmup = new Audio(SILENT_WAV_DATA_URL);
  warmup.volume = 0;
  warmup.preload = "auto";
  await warmup.play().catch(() => undefined);
  warmup.pause();
}

async function playTtsAudioUrl(audioUrl: string, volume: number, shouldPlay: () => boolean = () => true) {
  const audio = new Audio();
  audio.preload = "auto";
  audio.volume = Math.min(1, Math.max(0, volume / 100));
  audio.src = audioUrl;
  await warmUpAudioOutput();
  await waitForAudioReady(audio);
  await wait(TTS_AUDIO_START_DELAY_MS);
  if (!shouldPlay()) return null;
  await audio.play();
  return audio;
}

function isAlwaysInteractive(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, select, textarea, [data-hit='solid'], button:not([data-hit='alpha'])"));
}

function getContainRect(container: DOMRect, image: HTMLImageElement) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const containerRatio = container.width / container.height;
  if (containerRatio > imageRatio) {
    const width = container.height * imageRatio;
    return {
      left: container.left + (container.width - width) / 2,
      top: container.top,
      width,
      height: container.height
    };
  }
  const height = container.width / imageRatio;
  return {
    left: container.left,
    top: container.top + (container.height - height) / 2,
    width: container.width,
    height
  };
}

type HitRegion = { x: number; y: number; width: number; height: number };

function rectToHitRegion(rect: DOMRect): HitRegion {
  return {
    x: Math.max(0, Math.floor(rect.left)),
    y: Math.max(0, Math.floor(rect.top)),
    width: Math.ceil(rect.width),
    height: Math.ceil(rect.height)
  };
}

function useBootstrap() {
  const [data, setData] = useState<BootstrapData | null>(null);
  useEffect(() => {
    window.companionAPI.getBootstrap().then(setData);
    return window.companionAPI.onSettingsChanged((settings) => {
      setData((current) => current ? { ...current, settings } : current);
    });
  }, []);
  return [data, setData] as const;
}

function CompanionWindow() {
  const [data, setData] = useBootstrap();
  const [bubble, setBubble] = useState("哥哥，我在这里陪你。");
  const [isTalking, setIsTalking] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [bubbleOverflowing, setBubbleOverflowing] = useState(false);
  const lastInteractionRef = useRef(Date.now());
  const dragStateRef = useRef<{ pointerId: number; startScreenX: number; startScreenY: number; screenX: number; screenY: number; moved: boolean; startedOnAvatar: boolean } | null>(null);
  const suppressAvatarClickRef = useRef(false);
  const bubbleRef = useRef<HTMLElement | null>(null);
  const bubbleTextRef = useRef<HTMLParagraphElement | null>(null);
  const avatarRef = useRef<HTMLButtonElement | null>(null);
  const avatarImageRef = useRef<HTMLImageElement | null>(null);
  const actionsRef = useRef<HTMLElement | null>(null);
  const chatRef = useRef<HTMLFormElement | null>(null);
  const settingsRef = useRef<AppSettings | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsPlaybackIdRef = useRef(0);
  const bubbleWheelStateRef = useRef({ lastAt: 0, direction: 0 });

  useEffect(() => {
    settingsRef.current = data?.settings ?? null;
  }, [data?.settings]);

  useEffect(() => {
    const element = bubbleTextRef.current;
    if (!element) return;
    element.scrollTop = 0;
    bubbleWheelStateRef.current = { lastAt: 0, direction: 0 };
    const updateOverflow = () => {
      setBubbleOverflowing(element.scrollHeight > element.clientHeight + 1);
    };
    const frame = window.requestAnimationFrame(updateOverflow);
    const timer = window.setTimeout(updateOverflow, 80);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [bubble, data?.settings.bubbleFontSize]);

  useEffect(() => {
    const element = bubbleTextRef.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      if (element.scrollHeight <= element.clientHeight) return;
      const normalizedDelta = normalizeBubbleWheelDelta(event.deltaY, event.deltaMode, element.clientHeight);
      if (normalizedDelta === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const direction = Math.sign(normalizedDelta);
      const previous = bubbleWheelStateRef.current;
      if (direction === previous.direction && event.timeStamp - previous.lastAt < BUBBLE_WHEEL_MIN_INTERVAL_MS) {
        return;
      }
      bubbleWheelStateRef.current = { lastAt: event.timeStamp, direction };
      const speed = settingsRef.current?.bubbleScrollSpeed ?? DEFAULT_BUBBLE_SCROLL_SPEED;
      element.scrollTop += normalizedDelta * speed;
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [data?.settings.bubbleScrollSpeed, bubbleOverflowing]);

  async function speakCompanionText(text: string, source: ChatResult["source"] = "mock") {
    const tts = settingsRef.current?.addons.tts;
    if (!tts?.enabled) return;
    if (source === "mock" && !tts.speakLocalReplies) return;
    if (source === "model" && !tts.speakModelReplies) return;
    const speechText = sanitizeTtsSpeechText(text);
    if (!speechText) return;
    if (tts.interruptOnNewReply) {
      ttsPlaybackIdRef.current += 1;
      remoteAudioRef.current?.pause();
    }
    const playbackId = tts.interruptOnNewReply ? ttsPlaybackIdRef.current : 0;
    const result = await window.companionAPI.speakText(speechText).catch(() => null);
    if (result?.audioUrl) {
      void playTtsAudioUrl(result.audioUrl, tts.volume, () => !tts.interruptOnNewReply || playbackId === ttsPlaybackIdRef.current)
        .then((audio) => {
          if (!audio) return;
          if (tts.interruptOnNewReply && playbackId !== ttsPlaybackIdRef.current) {
            audio.pause();
            return;
          }
          remoteAudioRef.current = audio;
        })
        .catch(() => undefined);
    }
  }

  async function analyzeScreenForCompanion(options: { manual?: boolean } = {}) {
    if (isTalking) return;
    if (!data?.settings.addons.screenAwareness.enabled) {
      if (options.manual) {
        const fallback = "我还看不见呢，哥哥先开下桌面感知吧。";
        lastInteractionRef.current = Date.now();
        setBubble(fallback);
        speakCompanionText(fallback, "mock");
      }
      return;
    }
    lastInteractionRef.current = Date.now();
    setIsTalking(true);
    setBubble("我看一看，等我一下。");
    try {
      const result = await withTimeout(window.companionAPI.analyzeScreen(buildScreenAnalysisRequest(options.manual)), CHAT_TIMEOUT_MS + 20000, "screen analysis timeout");
      setBubble(result.text);
      speakCompanionText(result.text, result.source);
      setData((current) => current ? {
        ...current,
        settings: {
          ...current.settings,
          selectedMood: result.mood,
          selectedBubble: current.assets.moods.find((m) => m.id === result.mood)?.bubble ?? current.settings.selectedBubble
        }
      } : current);
    } catch {
      const fallback = "屏幕分析刚刚没接住，哥哥稍等一下再试。";
      setBubble(fallback);
      speakCompanionText(fallback, "mock");
    } finally {
      setIsTalking(false);
    }
  }

  useEffect(() => {
    if (!data) return;
    const timers = Object.entries(data.settings.reminders)
      .filter(([id, config]) => id !== "inactivity" && config.enabled)
      .map(([id, config]) => window.setInterval(() => {
        const reminder = data.reminderMessages[id];
        const mood = reminder?.mood ?? config.mood ?? "happy";
        const text = reminder?.message ?? config.message ?? "";
        setBubble(text);
        speakCompanionText(text, "mock");
        setData((current) => current ? {
          ...current,
          settings: {
            ...current.settings,
            selectedCostume: current.settings.selectedCostume,
            selectedMood: mood,
            selectedBubble: current.assets.moods.find((m) => m.id === mood)?.bubble ?? current.settings.selectedBubble
          }
        } : current);
      }, Math.max(1, config.minutes) * 60 * 1000));
    return () => timers.forEach(window.clearInterval);
  }, [data?.settings.reminders]);

  useEffect(() => {
    const inactivity = data?.settings.reminders.inactivity;
    const inactivityMessage = data?.reminderMessages.inactivity;
    if (!data || !inactivity?.enabled) return;

    const timer = window.setInterval(() => {
      const inactiveMs = Date.now() - lastInteractionRef.current;
      const thresholdMs = Math.max(1, inactivity.minutes) * 60 * 1000;
      if (inactiveMs < thresholdMs) return;

      lastInteractionRef.current = Date.now();
      const mood = inactivityMessage?.mood ?? inactivity.mood ?? "care";
      const text = inactivityMessage?.message ?? inactivity.message ?? "";
      setBubble(text);
      speakCompanionText(text, "mock");
      setData((current) => current ? {
        ...current,
        settings: {
          ...current.settings,
          selectedCostume: current.settings.selectedCostume,
          selectedMood: mood,
          selectedBubble: current.assets.moods.find((m) => m.id === mood)?.bubble ?? current.settings.selectedBubble
        }
      } : current);
    }, 30 * 1000);

    return () => window.clearInterval(timer);
  }, [data?.settings.reminders.inactivity, data?.reminderMessages.inactivity]);

  useEffect(() => {
    if (!data?.settings.proactiveBubbles.enabled || data.idleBubbles.length === 0) return;

    const timer = window.setInterval(() => {
      const idleMs = Date.now() - lastInteractionRef.current;
      const minIdleMs = Math.max(1, data.settings.proactiveBubbles.minIdleMinutes) * 60 * 1000;
      if (idleMs < minIdleMs) return;

      const nextBubble = data.idleBubbles[Math.floor(Math.random() * data.idleBubbles.length)];
      setBubble(nextBubble.text);
      speakCompanionText(nextBubble.text, "mock");
      setData((current) => current ? {
        ...current,
        settings: {
          ...current.settings,
          selectedCostume: current.settings.selectedCostume,
          selectedMood: nextBubble.mood,
          selectedBubble: current.assets.moods.find((m) => m.id === nextBubble.mood)?.bubble ?? current.settings.selectedBubble
        }
      } : current);
    }, Math.max(1, data.settings.proactiveBubbles.minutes) * 60 * 1000);

    return () => window.clearInterval(timer);
  }, [data?.settings.proactiveBubbles, data?.idleBubbles]);

  useEffect(() => {
    const addon = data?.settings.addons.screenAwareness;
    if (!addon?.enabled || addon.mode !== "interval") return;
    const timer = window.setInterval(() => {
      void analyzeScreenForCompanion();
    }, Math.max(30, addon.intervalSeconds) * 1000);
    return () => window.clearInterval(timer);
  }, [data?.settings.addons.screenAwareness.enabled, data?.settings.addons.screenAwareness.mode, data?.settings.addons.screenAwareness.intervalSeconds]);

  useEffect(() => {
    if (!data) return;
    const timer = window.setInterval(() => {
      const inactiveMs = Date.now() - lastInteractionRef.current;
      if (inactiveMs < 60 * 1000) return;

      setData((current) => {
        if (!current || current.settings.selectedMood === "idle") return current;
        const nextSettings = {
          ...current.settings,
          selectedCostume: current.settings.selectedCostume,
          selectedMood: "idle" as MoodId,
          selectedBubble: current.assets.moods.find((m) => m.id === "idle")?.bubble ?? current.settings.selectedBubble
        };
        void window.companionAPI.saveSettings(nextSettings);
        return {
          ...current,
          settings: nextSettings
        };
      });
    }, 10 * 1000);

    return () => window.clearInterval(timer);
  }, [data]);

  function buildAvatarHitRegions(): HitRegion[] {
    const avatarButton = avatarRef.current;
    const image = avatarImageRef.current;
    if (!avatarButton || !image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      return avatarButton ? [rectToHitRegion(avatarButton.getBoundingClientRect())] : [];
    }

    const avatarRect = getContainRect(avatarButton.getBoundingClientRect(), image);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("canvas context unavailable");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const rowStep = Math.max(1, Math.ceil(image.naturalHeight / 520));
      const regions: HitRegion[] = [];

      for (let y = 0; y < image.naturalHeight; y += rowStep) {
        let minX = image.naturalWidth;
        let maxX = -1;
        const rowEnd = Math.min(image.naturalHeight, y + rowStep);
        for (let scanY = y; scanY < rowEnd; scanY += 1) {
          const rowOffset = scanY * image.naturalWidth * 4;
          for (let x = 0; x < image.naturalWidth; x += 1) {
            if (pixels[rowOffset + x * 4 + 3] > ALPHA_HIT_THRESHOLD) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
            }
          }
        }
        if (maxX < minX) continue;
        const left = avatarRect.left + (minX / image.naturalWidth) * avatarRect.width;
        const top = avatarRect.top + (y / image.naturalHeight) * avatarRect.height;
        const right = avatarRect.left + ((maxX + 1) / image.naturalWidth) * avatarRect.width;
        const bottom = avatarRect.top + (rowEnd / image.naturalHeight) * avatarRect.height;
        regions.push({
          x: Math.max(0, Math.floor(left)),
          y: Math.max(0, Math.floor(top)),
          width: Math.max(1, Math.ceil(right) - Math.floor(left)),
          height: Math.max(1, Math.ceil(bottom) - Math.floor(top))
        });
      }

      return regions.length > 0 ? regions : [{
        x: Math.max(0, Math.floor(avatarRect.left)),
        y: Math.max(0, Math.floor(avatarRect.top)),
        width: Math.ceil(avatarRect.width),
        height: Math.ceil(avatarRect.height)
      }];
    } catch {
      return [{
        x: Math.max(0, Math.floor(avatarRect.left)),
        y: Math.max(0, Math.floor(avatarRect.top)),
        width: Math.ceil(avatarRect.width),
        height: Math.ceil(avatarRect.height)
      }];
    }
  }

  function syncHitRegions(includeControls = true) {
    const regions = buildAvatarHitRegions();
    if (includeControls) {
      for (const element of [bubbleRef.current, actionsRef.current, chatRef.current]) {
        if (element instanceof HTMLElement) {
          const region = rectToHitRegion(element.getBoundingClientRect());
          if (region.width > 0 && region.height > 0) regions.push(region);
        }
      }
    }
    void window.companionAPI.setHitRegions(regions);
  }

  useEffect(() => {
    if (!data) return;
    const syncFullHitRegions = () => syncHitRegions(true);
    const frame = window.requestAnimationFrame(syncFullHitRegions);
    const timer = window.setTimeout(syncFullHitRegions, 120);
    window.addEventListener("resize", syncFullHitRegions);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("resize", syncFullHitRegions);
    };
  }, [
    data?.settings.scale,
    data?.settings.selectedCostume,
    data?.settings.selectedMood,
    data?.settings.selectedBubble,
    data?.settings.extensions.activeRenderer,
    data?.settings.extensions.activeGifAnimation,
    data?.settings.extensions.preferGeneratedAvatars
  ]);

  if (!data) return <div className="loading">加载妹妹中...</div>;
  const { assets, settings } = data;
  const currentMood = assets.moods.find((m) => m.id === settings.selectedMood) ?? assets.moods[0];
  const currentBubble = assets.bubbles.find((b) => b.id === settings.selectedBubble) ?? assets.bubbles.find((b) => b.id === currentMood.bubble) ?? assets.bubbles[0];
  const currentAvatar = resolveAvatarPath(assets, settings);
  const fallbackAvatar = resolveFallbackAvatarPath(assets, settings);
  const activeGif = assets.gifAnimations.find((gif) => gif.id === settings.extensions.activeGifAnimation && gif.enabled);
  const currentCostume = assets.costumes.find((costume) => costume.id === settings.selectedCostume);

  function buildScreenAnalysisRequest(manual?: boolean): ScreenAnalysisRequest {
    return {
      trigger: manual ? "manual" : "auto",
      context: {
        userAddress: settings.identity.userAddress,
        characterName: settings.identity.characterName,
        selfReference: settings.identity.selfReference,
        mood: settings.selectedMood,
        moodName: currentMood.name,
        costumeId: settings.selectedCostume,
        costumeName: currentCostume?.name ?? settings.selectedCostume,
        bubbleId: settings.selectedBubble,
        workMode: settings.workMode,
        companionMode: settings.companionMode
      }
    };
  }

  function triggerAvatarInteraction(ignoreSuppress = false) {
    if (isTalking || (!ignoreSuppress && suppressAvatarClickRef.current)) return;
    void sendCompanionMessage(undefined, { allowLocalFallback: true });
  }

  function startCompanionDrag(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0 || settings.locked || isAlwaysInteractive(event.target)) return;
    const startedOnAvatar = event.target instanceof Element && Boolean(event.target.closest(".avatar-button"));
    dragStateRef.current = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      screenX: event.screenX,
      screenY: event.screenY,
      moved: false,
      startedOnAvatar
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    syncHitRegions(false);
  }

  function moveCompanionDrag(event: React.PointerEvent<HTMLElement>) {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const deltaX = event.screenX - state.screenX;
    const deltaY = event.screenY - state.screenY;
    if (deltaX === 0 && deltaY === 0) return;
    if (Math.abs(event.screenX - state.startScreenX) + Math.abs(event.screenY - state.startScreenY) > 4) {
      state.moved = true;
      suppressAvatarClickRef.current = true;
    }
    if (!state.moved) return;
    state.screenX = event.screenX;
    state.screenY = event.screenY;
    event.preventDefault();
    void window.companionAPI.moveCompanionBy(deltaX, deltaY);
  }

  function endCompanionDrag(event: React.PointerEvent<HTMLElement>) {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (event.type === "pointerup" && !state.moved && state.startedOnAvatar) {
      suppressAvatarClickRef.current = true;
      triggerAvatarInteraction(true);
    }
    window.setTimeout(() => {
      suppressAvatarClickRef.current = false;
      syncHitRegions(true);
    }, 0);
  }

  function showContextMenu(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    void window.companionAPI.showCompanionMenu();
  }

  async function sendCompanionMessage(message?: string, options: { allowLocalFallback?: boolean } = {}) {
    if (isTalking) return;
    const typedMessage = chatInput.trim();
    const finalMessage = message ?? (typedMessage || "妹妹，陪我一下");
    if (shouldTriggerScreenAnalysis(finalMessage, settings.addons.screenAwareness.enabled)) {
      setChatInput("");
      await analyzeScreenForCompanion({ manual: true });
      return;
    }
    lastInteractionRef.current = Date.now();
    setIsTalking(true);
    setBubble("我在听，等我一下下。");
    try {
      const result = await withTimeout(
        window.companionAPI.sendChatRequest({
          message: finalMessage,
          mood: settings.selectedMood,
          history: chatHistory,
          allowLocalFallback: options.allowLocalFallback === true
        }),
        CHAT_TIMEOUT_MS,
        "chat timeout"
      );
      setBubble(result.text);
      speakCompanionText(result.text, result.source);
      setChatHistory((current) => [...current, { role: "user" as const, content: finalMessage }, { role: "assistant" as const, content: result.text }].slice(-40));
      setChatInput("");
      const modelCostumeId = typeof result.details?.costumeId === "string" ? result.details.costumeId : "";
      const selectedCostume = assets.costumes.some((costume) => costume.enabled && costume.id === modelCostumeId)
        ? modelCostumeId
        : settings.selectedCostume;
      const next = {
        ...settings,
        selectedCostume,
        selectedMood: result.mood,
        selectedBubble: assets.moods.find((m) => m.id === result.mood)?.bubble ?? settings.selectedBubble
      };
      setData((current) => current ? { ...current, settings: next } : current);
      await window.companionAPI.saveSettings(next);
    } catch {
      const fallback = "哥哥，妹妹刚刚没听清，我们稍等一下再说，好不好？";
      setBubble(fallback);
      speakCompanionText(fallback, "mock");
    } finally {
      setIsTalking(false);
    }
  }

  return (
    <main
      className="companion-shell"
      style={{
        "--companion-scale": settings.scale,
        "--bubble-font-size": `${settings.bubbleFontSize}px`
      } as React.CSSProperties}
      onContextMenu={showContextMenu}
    >
      <div
        className="companion-stage"
        onPointerDown={startCompanionDrag}
        onPointerMove={moveCompanionDrag}
        onPointerUp={endCompanionDrag}
        onPointerCancel={endCompanionDrag}
      >
        <section ref={bubbleRef} className={`speech-bubble ${currentBubble.id}`} data-hit="alpha">
          <img src={assetUrl(currentBubble.file, data.appPath)} alt="" draggable={false} onLoad={() => syncHitRegions(true)} onDragStart={(event) => event.preventDefault()} />
          <p ref={bubbleTextRef} className={bubbleOverflowing ? "is-overflowing" : ""}><span>{bubble}</span></p>
        </section>
        <button
          ref={avatarRef}
          className={`avatar-button ${isTalking ? "talking" : ""}`}
          onClick={() => triggerAvatarInteraction()}
          title="点击互动"
          aria-busy={isTalking}
          aria-disabled={isTalking}
          data-hit="alpha"
        >
          {settings.extensions.activeRenderer === "live2d" ? (
            <div className="reserved-renderer" data-hit="solid">Live2D 预留</div>
          ) : (
            <img
              ref={avatarImageRef}
              className="avatar-art"
              src={assetUrl(settings.extensions.activeRenderer === "gif" && activeGif ? activeGif.file : currentAvatar, data.appPath)}
              draggable={false}
              onLoad={() => syncHitRegions(true)}
              onDragStart={(event) => event.preventDefault()}
              onError={(event) => {
                event.currentTarget.onerror = () => {
                  event.currentTarget.src = assetUrl(assets.defaultAvatar, data.appPath);
                };
                event.currentTarget.src = assetUrl(fallbackAvatar, data.appPath);
              }}
              alt="桌面陪伴精灵"
            />
          )}
        </button>
        <nav ref={actionsRef} className="companion-actions" data-hit="solid">
          <button onClick={() => analyzeScreenForCompanion({ manual: true })} title="分析屏幕"><MonitorUp size={18} /></button>
        </nav>
        <form ref={chatRef} className="companion-chat" data-hit="solid" onSubmit={(event) => { event.preventDefault(); sendCompanionMessage(undefined, { allowLocalFallback: false }); }}>
          <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="和妹妹说句话" />
          <button disabled={isTalking}>{isTalking ? "..." : "发送"}</button>
        </form>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function yesNo(value: boolean) {
  return value ? "已开启" : "已关闭";
}

const moodLabels: Record<MoodId, string> = {
  idle: "待机",
  happy: "开心",
  shy: "害羞",
  care: "关心",
  encourage: "鼓励",
  sleepy: "困倦"
};

const rendererLabels: Record<AvatarRenderer, string> = {
  static: "静态立绘",
  gif: "GIF 动图",
  live2d: "Live2D"
};

const providerLabels: Record<ModelProvider, string> = {
  mock: "本地模拟回复",
  openai: "OpenAI",
  minimax: "MiniMax",
  deepseek: "DeepSeek",
  qwen: "通义千问",
  zhipu: "智谱 GLM",
  moonshot: "月之暗面 Kimi",
  siliconflow: "硅基流动",
  "openai-compatible": "OpenAI 兼容接口",
  ollama: "Ollama 本地模型",
  lmstudio: "LM Studio 本地模型",
  custom: "自定义接口"
};

const modelPresets: Array<{ id: string; provider: ModelProvider; label: string; url: string; model: string; hint: string; maxTokens?: number }> = [
  { id: "minimax-m3", provider: "minimax", label: "MiniMax", url: "https://api.minimax.chat", model: "MiniMax-M3", maxTokens: 1000, hint: "MiniMax 兼容预设；保留较完整输出，避免回复被截短。" },
  { id: "deepseek-text", provider: "deepseek", label: "DeepSeek 文本", url: "https://api.deepseek.com", model: "deepseek-v4-flash", hint: "DeepSeek 官方托管文本接口预设。" },
  { id: "multimodal-compatible", provider: "openai-compatible", label: "多模态兼容", url: "https://api.example.com/v1", model: "your-vision-model", hint: "用于其它支持图片输入的 OpenAI-compatible 多模态模型。" },
  { id: "qwen-plus", provider: "qwen", label: "通义千问", url: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", hint: "阿里云 DashScope 兼容模式预设。" },
  { id: "qwen-vl", provider: "qwen", label: "千问视觉", url: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-vl-max", hint: "阿里云 DashScope 兼容模式视觉预设；用于桌面感知等图片输入场景。" },
  { id: "zhipu-glm", provider: "zhipu", label: "智谱 GLM", url: "https://open.bigmodel.cn/api/paas/v4", model: "glm-5.1-flash", hint: "智谱 OpenAI-compatible 预设。" },
  { id: "moonshot", provider: "moonshot", label: "Kimi", url: "https://api.moonshot.cn", model: "moonshot-v1-8k", hint: "月之暗面 Kimi 兼容预设。" },
  { id: "siliconflow", provider: "siliconflow", label: "硅基流动", url: "https://api.siliconflow.cn", model: "Pro/zai-org/GLM-4.7", hint: "硅基流动 OpenAI-compatible 预设。" },
  { id: "openai", provider: "openai", label: "OpenAI", url: "https://api.openai.com", model: "gpt-4o-mini", hint: "OpenAI 官方接口预设。" },
  { id: "openai-compatible", provider: "openai-compatible", label: "兼容接口", url: "https://api.example.com", model: "your-model-name", hint: "适合其它兼容 /v1/chat/completions 的厂商。" },
  { id: "ollama", provider: "ollama", label: "Ollama 本地", url: "http://127.0.0.1:11434", model: "qwen2.5:7b", hint: "本地 Ollama 默认地址。" },
  { id: "lmstudio", provider: "lmstudio", label: "LM Studio 本地", url: "http://127.0.0.1:1234", model: "local-model", hint: "本地 LM Studio 默认地址。" }
];

const visionModelPresets: Array<{ id: string; provider: ModelProvider; label: string; url: string; model: string; hint: string; maxTokens?: number }> = [
  { id: "qwen-vl", provider: "qwen", label: "千问视觉", url: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-vl-max", maxTokens: 800, hint: "阿里云 DashScope 兼容模式视觉模型，保留完整短回复。" },
  { id: "minimax-vision", provider: "minimax", label: "MiniMax 视觉", url: "https://api.minimax.chat", model: "MiniMax-M1", maxTokens: 800, hint: "MiniMax OpenAI-compatible 视觉模型预设；如账号侧模型名不同可手动改。" },
  { id: "openai-vision", provider: "openai", label: "OpenAI 视觉", url: "https://api.openai.com", model: "gpt-4o-mini", maxTokens: 800, hint: "OpenAI 支持图片输入的视觉模型预设，保留完整短回复。" },
  { id: "zhipu-vision", provider: "zhipu", label: "智谱视觉", url: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4v-flash", maxTokens: 800, hint: "智谱 GLM-4V 视觉模型预设，保留完整短回复。" },
  { id: "siliconflow-vision", provider: "siliconflow", label: "硅基多模态", url: "https://api.siliconflow.cn", model: "Qwen/Qwen2.5-VL-72B-Instruct", maxTokens: 800, hint: "硅基流动多模态模型预设，保留完整短回复。" },
  { id: "compatible-vision", provider: "openai-compatible", label: "兼容视觉", url: "https://api.example.com/v1", model: "your-vision-model", maxTokens: 800, hint: "其它 OpenAI-compatible 图片输入模型，保留完整短回复。" }
];
type TtsPreset = {
  id: string;
  label: string;
  provider: AppSettings["addons"]["tts"]["provider"];
  voice: string;
  model?: string;
  emotion?: string;
  languageBoost?: string;
  audioFormat?: AppSettings["addons"]["tts"]["audioFormat"];
  sampleRate?: number;
  bitrate?: number;
  channel?: AppSettings["addons"]["tts"]["channel"];
  remoteUrl?: string;
  remoteMethod?: AppSettings["addons"]["tts"]["remoteMethod"];
  remoteAuthHeader?: string;
  remoteContentType?: string;
  remoteBodyTemplate?: string;
  remoteAudioField?: string;
  hint: string;
};

const ttsPresets: TtsPreset[] = [
  {
    id: "minimax",
    label: "MiniMax TTS",
    provider: "minimax",
    voice: "male-qn-qingse",
    model: "speech-2.8-hd",
    languageBoost: "auto",
    audioFormat: "mp3",
    sampleRate: 32000,
    bitrate: 128000,
    channel: 1,
    remoteUrl: "https://api-bj.minimaxi.com/v1/t2a_v2",
    remoteMethod: "POST",
    remoteAuthHeader: "Authorization",
    remoteContentType: "application/json",
    remoteAudioField: "audio",
    hint: "MiniMax 同步语音合成接口，返回 hex 音频并在本地播放。"
  },
  {
    id: "openai-tts",
    label: "OpenAI TTS",
    provider: "openai",
    voice: "alloy",
    model: "gpt-4o-mini-tts",
    audioFormat: "mp3",
    remoteUrl: "https://api.openai.com/v1/audio/speech",
    remoteMethod: "POST",
    remoteAuthHeader: "Authorization",
    remoteContentType: "application/json",
    remoteBodyTemplate: "{\n  \"model\": \"{{model}}\",\n  \"voice\": \"{{voice}}\",\n  \"input\": \"{{text}}\",\n  \"format\": \"mp3\"\n}",
    remoteAudioField: "audio",
    hint: "OpenAI 语音合成；API Key 建议填写 Bearer sk-...，接口通常直接返回音频。"
  },
  {
    id: "azure-speech",
    label: "Azure 语音",
    provider: "azure",
    voice: "zh-CN-XiaoxiaoNeural",
    model: "",
    audioFormat: "mp3",
    remoteUrl: "https://YOUR_REGION.tts.speech.microsoft.com/cognitiveservices/v1",
    remoteMethod: "POST",
    remoteAuthHeader: "Ocp-Apim-Subscription-Key",
    remoteContentType: "application/ssml+xml",
    remoteBodyTemplate: "<speak version=\"1.0\" xml:lang=\"zh-CN\"><voice name=\"{{voice}}\">{{text}}</voice></speak>",
    remoteAudioField: "audio",
    hint: "Azure Speech；需要把 YOUR_REGION 换成区域，并按服务要求补充输出格式 Header。"
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    provider: "elevenlabs",
    voice: "21m00Tcm4TlvDq8ikWAM",
    model: "eleven_multilingual_v2",
    audioFormat: "mp3",
    remoteUrl: "https://api.elevenlabs.io/v1/text-to-speech/{{voice}}",
    remoteMethod: "POST",
    remoteAuthHeader: "xi-api-key",
    remoteContentType: "application/json",
    remoteBodyTemplate: "{\n  \"text\": \"{{text}}\",\n  \"model_id\": \"{{model}}\"\n}",
    remoteAudioField: "audio",
    hint: "ElevenLabs；音色 ID 会拼在 URL 中，接口通常直接返回音频。"
  },
  {
    id: "doubao-tts",
    label: "豆包/火山",
    provider: "doubao",
    voice: "zh_female_tianmeisongyuan_moon_bigtts",
    model: "tts-1",
    audioFormat: "mp3",
    remoteUrl: "https://openspeech.bytedance.com/api/v1/tts",
    remoteMethod: "POST",
    remoteAuthHeader: "Authorization",
    remoteContentType: "application/json",
    remoteBodyTemplate: "{\n  \"app\": { \"appid\": \"YOUR_APP_ID\", \"token\": \"YOUR_TOKEN\", \"cluster\": \"volcano_tts\" },\n  \"user\": { \"uid\": \"desktop-companion\" },\n  \"audio\": { \"voice_type\": \"{{voice}}\", \"encoding\": \"mp3\", \"speed_ratio\": {{rate}} },\n  \"request\": { \"reqid\": \"desktop-companion\", \"text\": \"{{text}}\", \"operation\": \"query\" }\n}",
    remoteAudioField: "data",
    hint: "火山/豆包语音预填模板；通常需要在请求体里替换 appid/token/cluster。"
  },
  {
    id: "aliyun-tts",
    label: "阿里云 TTS",
    provider: "aliyun",
    voice: "longxiaochun",
    model: "cosyvoice-v1",
    audioFormat: "mp3",
    remoteUrl: "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    remoteMethod: "POST",
    remoteAuthHeader: "Authorization",
    remoteContentType: "application/json",
    remoteBodyTemplate: "{\n  \"model\": \"{{model}}\",\n  \"input\": { \"text\": \"{{text}}\", \"voice\": \"{{voice}}\" }\n}",
    remoteAudioField: "audio",
    hint: "阿里云百炼/通义语音预设；不同模型响应字段可能不同，可在音频字段里调整。"
  },
  {
    id: "tencent-tts",
    label: "腾讯云 TTS",
    provider: "tencent",
    voice: "101001",
    model: "",
    audioFormat: "mp3",
    remoteUrl: "https://tts.tencentcloudapi.com",
    remoteMethod: "POST",
    remoteAuthHeader: "Authorization",
    remoteContentType: "application/json",
    remoteBodyTemplate: "{\n  \"Text\": \"{{text}}\",\n  \"VoiceType\": {{voice}},\n  \"Codec\": \"mp3\"\n}",
    remoteAudioField: "Audio",
    hint: "腾讯云 TTS 预设；腾讯云签名 Header 较复杂，适合配合代理服务或手动补齐鉴权。"
  },
  {
    id: "xunfei-tts",
    label: "讯飞 TTS",
    provider: "xunfei",
    voice: "xiaoyan",
    model: "",
    audioFormat: "mp3",
    remoteUrl: "https://tts-api.xfyun.cn/v2/tts",
    remoteMethod: "POST",
    remoteAuthHeader: "Authorization",
    remoteContentType: "application/json",
    remoteBodyTemplate: "{\n  \"business\": { \"aue\": \"lame\", \"vcn\": \"{{voice}}\", \"speed\": 50 },\n  \"data\": { \"text\": \"{{text}}\" }\n}",
    remoteAudioField: "audio",
    hint: "讯飞 TTS 预设；讯飞鉴权通常需要签名，建议按官方要求或代理接口补齐。"
  },
  {
    id: "custom",
    label: "自定义 API",
    provider: "custom",
    voice: "",
    remoteUrl: "",
    remoteMethod: "POST",
    remoteAuthHeader: "Authorization",
    remoteContentType: "application/json",
    remoteBodyTemplate: "{\n  \"text\": \"{{text}}\",\n  \"voice\": \"{{voice}}\"\n}",
    remoteAudioField: "audio",
    hint: "保留给其它 TTS 服务，支持音频 URL、data URL、base64 或 hex。"
  }
];

const ttsModelOptions = [
  "speech-2.8-hd",
  "speech-2.8-turbo",
  "speech-2.6-hd",
  "speech-2.6-turbo",
  "speech-02-hd",
  "speech-02-turbo",
  "speech-01-hd",
  "speech-01-turbo",
  "gpt-4o-mini-tts",
  "tts-1",
  "tts-1-hd",
  "eleven_multilingual_v2",
  "eleven_turbo_v2_5",
  "cosyvoice-v1",
  "sambert-zhichu-v1"
];

const ttsVoiceOptions = [
  { id: "male-qn-qingse", label: "MiniMax / male-qn-qingse" },
  { id: "female-shaonv", label: "MiniMax / female-shaonv" },
  { id: "female-yujie", label: "MiniMax / female-yujie" },
  { id: "male-qn-jingying", label: "MiniMax / male-qn-jingying" },
  { id: "male-qn-badao", label: "MiniMax / male-qn-badao" },
  { id: "Chinese (Mandarin)_Lyrical_Voice", label: "MiniMax / Chinese (Mandarin)_Lyrical_Voice" },
  { id: "Chinese (Mandarin)_HK_Flight_Attendant", label: "MiniMax / Chinese (Mandarin)_HK_Flight_Attendant" },
  { id: "English_Graceful_Lady", label: "MiniMax / English_Graceful_Lady" },
  { id: "English_Insightful_Speaker", label: "MiniMax / English_Insightful_Speaker" },
  { id: "Japanese_Whisper_Belle", label: "MiniMax / Japanese_Whisper_Belle" },
  { id: "Cantonese_GentleLady", label: "MiniMax / Cantonese_GentleLady" },
  { id: "alloy", label: "OpenAI / alloy" },
  { id: "verse", label: "OpenAI / verse" },
  { id: "coral", label: "OpenAI / coral" },
  { id: "zh-CN-XiaoxiaoNeural", label: "Azure / zh-CN-XiaoxiaoNeural" },
  { id: "zh-CN-YunxiNeural", label: "Azure / zh-CN-YunxiNeural" },
  { id: "21m00Tcm4TlvDq8ikWAM", label: "ElevenLabs / Rachel" },
  { id: "zh_female_tianmeisongyuan_moon_bigtts", label: "豆包/火山 / 甜美宋媛" },
  { id: "longxiaochun", label: "阿里云 / longxiaochun" },
  { id: "101001", label: "腾讯云 / 101001" },
  { id: "xiaoyan", label: "讯飞 / xiaoyan" }
];

const ttsUrlOptions = [
  "https://api-bj.minimaxi.com/v1/t2a_v2",
  "https://api.openai.com/v1/audio/speech",
  "https://YOUR_REGION.tts.speech.microsoft.com/cognitiveservices/v1",
  "https://api.elevenlabs.io/v1/text-to-speech/{{voice}}",
  "https://openspeech.bytedance.com/api/v1/tts",
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
  "https://tts.tencentcloudapi.com",
  "https://tts-api.xfyun.cn/v2/tts"
];

const ttsAuthHeaderOptions = [
  "Authorization",
  "Ocp-Apim-Subscription-Key",
  "xi-api-key",
  "X-Api-Key",
  "api-key"
];

const ttsContentTypeOptions = [
  "application/json",
  "application/ssml+xml",
  "audio/mpeg",
  "audio/wav"
];

const ttsAudioFieldOptions = [
  "audio",
  "data",
  "Audio",
  "audio_url",
  "url",
  "result.audio",
  "output.audio"
];
const healthSummaryLabels: Record<string, string> = {
  jsonFiles: "JSON 文件",
  assetRefs: "素材引用",
  replyRules: "回复规则",
  replyTypes: "回复类型",
  replyTotal: "回复总数",
  reminders: "提醒",
  idleBubbles: "主动冒泡",
  conversations: "聊天记录",
  keyPoints: "关键点",
  modelEnabled: "模型启用"
};

const replyTypeLabels: Record<string, string> = {
  fallback: "兜底回复",
  greeting: "问候",
  tired: "疲惫关怀",
  work: "工作陪伴",
  study: "学习陪伴",
  health: "健康提醒",
  praise: "夸夸鼓励",
  comfort: "安慰",
  memory: "日记记忆",
  model: "模型回复"
};

const keyPointSourceLabels: Record<KeyPoint["source"], string> = {
  manual: "手动记录",
  chat: "聊天提取",
  model: "模型摘要"
};

const replySourceLabels: Record<ChatResult["source"], string> = {
  mock: "本地回复",
  model: "模型回复"
};

const screenAnalysisRequestPattern = /(分析|看看|看一下|看下|识别|检查|总结|读一下|帮我看|帮忙看).*(屏幕|页面|网页|窗口|界面|当前页|这页|这个页面|画面|截图)|(屏幕|页面|网页|窗口|界面|当前页|这页|这个页面|画面|截图).*(分析|看看|看一下|看下|识别|检查|总结|读一下)/;
const screenAwarenessCasualTriggers = ["你看", "请看", "看看", "看这个", "看这边", "看这里", "帮我瞅", "瞅瞅"];

function shouldTriggerScreenAnalysis(message: string, screenAwarenessEnabled: boolean) {
  if (screenAnalysisRequestPattern.test(message)) return true;
  if (!screenAwarenessEnabled) return false;
  return screenAwarenessCasualTriggers.some((word) => message.includes(word));
}

function sanitizeTtsSpeechText(text: string) {
  let sanitized = String(text ?? "");
  const bracketPatterns = [/\([^()]*\)/g, /（[^（）]*）/g, /\[[^\[\]]*\]/g, /【[^【】]*】/g];
  let previous = "";
  while (sanitized !== previous) {
    previous = sanitized;
    for (const pattern of bracketPatterns) sanitized = sanitized.replace(pattern, "");
  }
  return sanitized
    .replace(/\s+/g, " ")
    .replace(/^[\s,，。.!！?？;；:：、]+|[\s,，。.!！?？;；:：、]+$/g, "")
    .replace(/([,，。.!！?？;；:：、]){2,}/g, "$1")
    .trim();
}

function normalizeBubbleWheelDelta(deltaY: number, deltaMode: number, viewportHeight: number) {
  if (deltaY === 0) return 0;
  const modeMultiplier = deltaMode === 1 ? 16 : deltaMode === 2 ? viewportHeight : 1;
  const pixelDelta = deltaY * modeMultiplier;
  const direction = Math.sign(pixelDelta);
  if (deltaMode !== 0) return direction * BUBBLE_WHEEL_DELTA_UNIT;
  if (Math.abs(pixelDelta) >= BUBBLE_WHEEL_DELTA_UNIT) return direction * BUBBLE_WHEEL_DELTA_UNIT;
  return pixelDelta;
}

function AdminWindow() {
  const [data, setData] = useBootstrap();
  const [tab, setTab] = useState("overview");
  const [persona, setPersona] = useState("");
  const [personaMessage, setPersonaMessage] = useState("");
  const [testInput, setTestInput] = useState("哥哥今天有点累");
  const [testReply, setTestReply] = useState<ChatResult | null>(null);
  const [testHistory, setTestHistory] = useState<ChatMessage[]>([]);
  const [health, setHealth] = useState<ExtensionHealth | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealthReport | null>(null);
  const [healthModelTest, setHealthModelTest] = useState<ChatResult | null>(null);
  const [secretStatus, setSecretStatus] = useState<ModelSecretStatus | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [visionApiKeyInput, setVisionApiKeyInput] = useState("");
  const [keyPoints, setKeyPoints] = useState<KeyPoint[]>([]);
  const [recentConversations, setRecentConversations] = useState<ConversationRecord[]>([]);
  const [keyPointInput, setKeyPointInput] = useState("");
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [pendingScale, setPendingScale] = useState(1);
  const [pendingBubbleScrollFactor, setPendingBubbleScrollFactor] = useState(1);
  const [bubbleScrollMessage, setBubbleScrollMessage] = useState("");
  const [ttsVoices, setTtsVoices] = useState<TtsVoice[]>([]);
  const [ttsMessage, setTtsMessage] = useState("");
  const [screenAnalysis, setScreenAnalysis] = useState<ScreenAnalysisResult | null>(null);
  const [screenAwarenessDraft, setScreenAwarenessDraft] = useState<AppSettings["addons"]["screenAwareness"] | null>(null);
  const [screenAwarenessMessage, setScreenAwarenessMessage] = useState("");
  const [screenAwarenessDirty, setScreenAwarenessDirty] = useState(false);
  const [remindersDraft, setRemindersDraft] = useState<AppSettings["reminders"] | null>(null);
  const [proactiveBubblesDraft, setProactiveBubblesDraft] = useState<AppSettings["proactiveBubbles"] | null>(null);
  const [remindersMessage, setRemindersMessage] = useState("");
  const [remindersDirty, setRemindersDirty] = useState(false);

  useEffect(() => {
    if (data) setPersona(data.persona);
  }, [data?.persona]);

  useEffect(() => {
    if (data) setPendingScale(data.settings.scale);
  }, [data?.settings.scale]);

  useEffect(() => {
    if (data) setPendingBubbleScrollFactor(speedToBubbleScrollFactor(data.settings.bubbleScrollSpeed));
  }, [data?.settings.bubbleScrollSpeed]);

  useEffect(() => {
    if (data && !screenAwarenessDirty) {
      setScreenAwarenessDraft(data.settings.addons.screenAwareness);
    }
  }, [data?.settings.addons.screenAwareness, screenAwarenessDirty]);

  useEffect(() => {
    if (data && !remindersDirty) {
      setRemindersDraft(data.settings.reminders);
      setProactiveBubblesDraft(data.settings.proactiveBubbles);
    }
  }, [data?.settings.reminders, data?.settings.proactiveBubbles, remindersDirty]);

  useEffect(() => {
    window.companionAPI.getExtensionHealth().then(setHealth);
  }, [data?.settings.extensions]);

  useEffect(() => {
    window.companionAPI.getKeyPoints().then(setKeyPoints);
    window.companionAPI.getRecentConversations().then(setRecentConversations);
    window.companionAPI.getSystemHealth().then(setSystemHealth);
    window.companionAPI.getModelSecretStatus().then(setSecretStatus);
    window.companionAPI.listTtsVoices().then(setTtsVoices).catch(() => setTtsVoices([]));
  }, []);

  if (!data) return <div className="admin-loading">后台加载中...</div>;
  const { assets, settings, replies } = data;
  const screenAwareness = screenAwarenessDraft ?? settings.addons.screenAwareness;
  const reminders = remindersDraft ?? settings.reminders;
  const proactiveBubbles = proactiveBubblesDraft ?? settings.proactiveBubbles;
  const replyRuleById = new Map(data.replyRules.map((rule) => [rule.id, rule]));

  async function updateSettings(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch };
    setData((current) => current ? { ...current, settings: next } : current);
    await window.companionAPI.saveSettings(next);
  }

  async function toggleAutostart() {
    const enabled = await window.companionAPI.setAutostart(!settings.autostart);
    setData((current) => current ? { ...current, settings: { ...current.settings, autostart: enabled } } : current);
  }

  async function saveAllSettings() {
    const next = {
      ...settings,
      scale: clampScale(pendingScale),
      reminders: remindersDraft ?? settings.reminders,
      proactiveBubbles: proactiveBubblesDraft ?? settings.proactiveBubbles,
      addons: {
        ...settings.addons,
        screenAwareness: screenAwarenessDraft ?? settings.addons.screenAwareness
      }
    };
    setData((current) => current ? { ...current, settings: next } : current);
    await window.companionAPI.saveSettings(next);
    setScreenAwarenessDraft(next.addons.screenAwareness);
    setScreenAwarenessDirty(false);
    setRemindersDraft(next.reminders);
    setProactiveBubblesDraft(next.proactiveBubbles);
    setRemindersDirty(false);
    setScreenAwarenessMessage("全部设置已保存。");
    setRemindersMessage("全部设置已保存。");
  }

  async function refreshPersona() {
    const nextPersona = await window.companionAPI.refreshPersona();
    setPersona(nextPersona);
    setPersonaMessage("人格文件已刷新。");
    setData((current) => current ? { ...current, persona: nextPersona } : current);
  }

  async function savePersona() {
    const nextPersona = await window.companionAPI.savePersona(persona);
    setPersona(nextPersona);
    setPersonaMessage("人格文件已保存。");
    setData((current) => current ? { ...current, persona: nextPersona } : current);
  }

  async function resetPersona() {
    const nextPersona = await window.companionAPI.resetPersona();
    setPersona(nextPersona);
    setPersonaMessage("人格文件已重置。");
    setData((current) => current ? { ...current, persona: nextPersona } : current);
  }

  function updateExtensions(patch: Partial<AppSettings["extensions"]>) {
    return updateSettings({ extensions: { ...settings.extensions, ...patch } });
  }

  function updateIdentity(patch: Partial<AppSettings["identity"]>) {
    return updateSettings({ identity: { ...settings.identity, ...patch } });
  }

  function updateTtsAddon(patch: Partial<AppSettings["addons"]["tts"]>) {
    return updateSettings({
      addons: {
        ...settings.addons,
        tts: { ...settings.addons.tts, ...patch }
      }
    });
  }

  function applyTtsPreset(preset: TtsPreset) {
    return updateTtsAddon({
      provider: preset.provider,
      voice: preset.voice,
      model: preset.model ?? settings.addons.tts.model,
      emotion: preset.emotion ?? settings.addons.tts.emotion,
      languageBoost: preset.languageBoost ?? settings.addons.tts.languageBoost,
      audioFormat: preset.audioFormat ?? settings.addons.tts.audioFormat,
      sampleRate: preset.sampleRate ?? settings.addons.tts.sampleRate,
      bitrate: preset.bitrate ?? settings.addons.tts.bitrate,
      channel: preset.channel ?? settings.addons.tts.channel,
      remoteUrl: preset.remoteUrl ?? settings.addons.tts.remoteUrl,
      remoteMethod: preset.remoteMethod ?? settings.addons.tts.remoteMethod,
      remoteAuthHeader: preset.remoteAuthHeader ?? settings.addons.tts.remoteAuthHeader,
      remoteContentType: preset.remoteContentType ?? settings.addons.tts.remoteContentType,
      remoteBodyTemplate: preset.remoteBodyTemplate ?? settings.addons.tts.remoteBodyTemplate,
      remoteAudioField: preset.remoteAudioField ?? settings.addons.tts.remoteAudioField
    });
  }

  function applyTtsProvider(provider: AppSettings["addons"]["tts"]["provider"]) {
    const preset = ttsPresets.find((item) => item.provider === provider);
    return preset ? applyTtsPreset(preset) : updateTtsAddon({ provider });
  }

  function updateScreenAwarenessDraft(patch: Partial<AppSettings["addons"]["screenAwareness"]>) {
    setScreenAwarenessDraft((current) => ({
      ...(current ?? settings.addons.screenAwareness),
      ...patch
    }));
    setScreenAwarenessDirty(true);
    setScreenAwarenessMessage("有未保存的桌面感知设置。");
  }

  async function saveScreenAwarenessSettings() {
    if (!screenAwarenessDraft) return;
    await updateSettings({
      addons: {
        ...settings.addons,
        screenAwareness: screenAwarenessDraft
      }
    });
    setScreenAwarenessDraft(screenAwarenessDraft);
    setScreenAwarenessDirty(false);
    setScreenAwarenessMessage("桌面感知设置已保存。");
  }

  function updateVisionModel(patch: Partial<AppSettings["model"]>) {
    const current = (screenAwarenessDraft ?? settings.addons.screenAwareness).visionModel;
    updateScreenAwarenessDraft({
      providerMode: "separate-vision",
      visionModel: { ...current, enabled: true, ...patch }
    });
  }

  function applyVisionModelPreset(presetId: string) {
    const preset = visionModelPresets.find((item) => item.id === presetId);
    if (!preset) return;
    updateScreenAwarenessDraft({
      providerMode: "separate-vision",
      visionModel: {
        ...(screenAwarenessDraft ?? settings.addons.screenAwareness).visionModel,
        enabled: true,
        provider: preset.provider,
        url: preset.url,
        baseURL: normalizeModelUrl(preset.provider, preset.url),
        model: preset.model,
        maxTokens: preset.maxTokens ?? (screenAwarenessDraft ?? settings.addons.screenAwareness).visionModel.maxTokens
      }
    });
  }

  function updateVisionProvider(provider: ModelProvider) {
    const current = (screenAwarenessDraft ?? settings.addons.screenAwareness).visionModel;
    updateScreenAwarenessDraft({
      providerMode: "separate-vision",
      visionModel: {
        ...current,
        enabled: true,
        provider,
        baseURL: normalizeModelUrl(provider, current.url ?? current.baseURL)
      }
    });
  }

  function updateReminderDraft(id: string, patch: Partial<AppSettings["reminders"][string]>) {
    setRemindersDraft((current) => {
      const base = current ?? settings.reminders;
      const existing = base[id] ?? settings.reminders[id];
      return {
        ...base,
        [id]: { ...existing, ...patch }
      };
    });
    setRemindersDirty(true);
    setRemindersMessage("有未保存的提醒设置。");
  }

  function updateProactiveBubblesDraft(patch: Partial<AppSettings["proactiveBubbles"]>) {
    setProactiveBubblesDraft((current) => ({
      ...(current ?? settings.proactiveBubbles),
      ...patch
    }));
    setRemindersDirty(true);
    setRemindersMessage("有未保存的提醒设置。");
  }

  async function saveReminderSettings() {
    const nextReminders = remindersDraft ?? settings.reminders;
    const nextProactiveBubbles = proactiveBubblesDraft ?? settings.proactiveBubbles;
    await updateSettings({
      reminders: nextReminders,
      proactiveBubbles: nextProactiveBubbles
    });
    setRemindersDraft(nextReminders);
    setProactiveBubblesDraft(nextProactiveBubbles);
    setRemindersDirty(false);
    setRemindersMessage("陪伴提醒设置已保存，新的时间间隔会从现在开始生效。");
  }

  async function testTts() {
    setTtsMessage("正在播放测试语音...");
    try {
      await updateSettings({ addons: { ...settings.addons, tts: { ...settings.addons.tts, enabled: true } } });
      const result = await window.companionAPI.speakText("哥哥，1.4 的语音附加件已经接上啦。");
      if (result.audioUrl) {
        void playTtsAudioUrl(result.audioUrl, settings.addons.tts.volume);
        setTtsMessage("TTS 音频已返回并播放。");
      } else {
        setTtsMessage(result.ok ? "测试语音已发送。" : result.message ?? "语音没有播放。");
      }
    } catch (error) {
      setTtsMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function stopTts() {
    await window.companionAPI.stopSpeech();
    setTtsMessage("已停止语音。");
  }

  async function runScreenAnalysis() {
    setScreenAnalysis(null);
    try {
      const currentScreenAwareness = screenAwarenessDraft ?? settings.addons.screenAwareness;
      if (screenAwarenessDirty || currentScreenAwareness !== settings.addons.screenAwareness) {
        await updateSettings({
          addons: {
            ...settings.addons,
            screenAwareness: currentScreenAwareness
          }
        });
        setScreenAwarenessDraft(currentScreenAwareness);
        setScreenAwarenessDirty(false);
        setScreenAwarenessMessage("已保存桌面感知设置，正在分析当前屏幕。");
      }
      const result = await window.companionAPI.analyzeScreen({
        trigger: "manual",
        context: {
          userAddress: settings.identity.userAddress,
          characterName: settings.identity.characterName,
          selfReference: settings.identity.selfReference,
          mood: settings.selectedMood,
          moodName: moodLabels[settings.selectedMood],
          costumeId: settings.selectedCostume,
          costumeName: assets.costumes.find((item) => item.id === settings.selectedCostume)?.name ?? settings.selectedCostume,
          bubbleId: settings.selectedBubble,
          workMode: settings.workMode,
          companionMode: settings.companionMode
        }
      });
      setScreenAnalysis(result);
    } catch (error) {
      setScreenAnalysis({
        text: error instanceof Error ? `屏幕分析刚刚没接住：${error.message}` : "屏幕分析刚刚没接住，哥哥稍等一下再试。",
        source: "mock",
        mood: "care",
        provider: "mock",
        category: "screen-awareness-error"
      });
    }
  }

  async function addKeyPoint() {
    const text = keyPointInput.trim();
    if (!text) return;
    const point = await window.companionAPI.addKeyPoint(text);
    setKeyPoints((current) => [point, ...current]);
    setKeyPointInput("");
  }

  async function deleteKeyPoint(id: string) {
    const next = await window.companionAPI.deleteKeyPoint(id);
    setKeyPoints(next);
  }

  async function refreshSystemHealth() {
    const report = await window.companionAPI.getSystemHealth();
    setSystemHealth(report);
  }

  async function testModelFromHealth() {
    const result = await window.companionAPI.testModelConnection();
    setHealthModelTest(result);
    await refreshSystemHealth();
  }

  function healthLabel(status: HealthStatus) {
    return status === "ok" ? "正常" : status === "warning" ? "注意" : "错误";
  }

  function normalizeModelUrl(provider: ModelProvider, rawUrl: string) {
    if (!rawUrl.trim()) return "";
    try {
      const parsed = new URL(rawUrl.trim());
      let pathname = parsed.pathname.replace(/\/+$/, "");
      if (provider === "deepseek" && parsed.hostname.toLowerCase() === "api.deepseek.com") {
        pathname = pathname.endsWith("/chat/completions") ? pathname : `${pathname}/chat/completions`;
      } else if (provider === "ollama") {
        pathname = pathname.endsWith("/v1/chat/completions") ? pathname : `${pathname}/v1/chat/completions`;
      } else if (provider !== "mock") {
        if (pathname.endsWith("/v1")) pathname = `${pathname}/chat/completions`;
        else if (!pathname.endsWith("/chat/completions")) pathname = `${pathname}/v1/chat/completions`;
      }
      parsed.pathname = pathname.replace(/\/{2,}/g, "/");
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return "";
    }
  }

  function applyModelUrl() {
    const endpoint = normalizeModelUrl(settings.model.provider, settings.model.url ?? settings.model.baseURL);
    updateSettings({ model: { ...settings.model, baseURL: endpoint } });
  }

  function applyModelPreset(provider: ModelProvider, url: string, model: string, maxTokens?: number) {
    const endpoint = normalizeModelUrl(provider, url);
    updateSettings({
      model: {
        ...settings.model,
        enabled: true,
        provider,
        url,
        baseURL: endpoint,
        model,
        maxTokens: maxTokens ?? settings.model.maxTokens
      }
    });
  }

  async function saveApiKey() {
    const status = await window.companionAPI.saveModelApiKey(apiKeyInput);
    setSecretStatus(status);
    setApiKeyInput("");
  }

  async function saveVisionApiKey() {
    const status = await window.companionAPI.saveVisionApiKey(visionApiKeyInput);
    setSecretStatus(status);
    setVisionApiKeyInput("");
    setScreenAwarenessMessage("视觉 API Key 已保存。");
  }

  async function sendModelTest() {
    const result = await window.companionAPI.sendChatRequest({ message: testInput, history: testHistory });
    setTestReply(result);
    setTestHistory((current) => [...current, { role: "user" as const, content: testInput }, { role: "assistant" as const, content: result.text }].slice(-40));
  }

  async function refreshRuntimeState() {
    const [nextData, nextKeyPoints, nextConversations, nextHealth, nextSecretStatus] = await Promise.all([
      window.companionAPI.getBootstrap(),
      window.companionAPI.getKeyPoints(),
      window.companionAPI.getRecentConversations(),
      window.companionAPI.getSystemHealth(),
      window.companionAPI.getModelSecretStatus()
    ]);
    setData(nextData);
    setPersona(nextData.persona);
    setKeyPoints(nextKeyPoints);
    setRecentConversations(nextConversations);
    setSystemHealth(nextHealth);
    setSecretStatus(nextSecretStatus);
  }

  async function clearLocalRecords() {
    if (!window.confirm("确认清除聊天记录、日记关键点、运行日志和备份吗？设置、API Key、素材和回复库会保留。")) return;
    const result = await window.companionAPI.clearLocalData();
    setMaintenanceMessage(`已清除：${result.cleared.join("。")}`);
    await refreshRuntimeState();
  }

  async function resetFactorySettings() {
    if (!window.confirm("确认恢复出厂设置吗？这会重置设置、清空 API Key、聊天记录、关键点、日志和备份，但会保留素材、回复库和人格文档。")) return;
    const result = await window.companionAPI.factoryReset();
    setMaintenanceMessage(`已恢复：${result.reset.join("。")}`);
    setApiKeyInput("");
    await refreshRuntimeState();
  }

  function clampScale(value: number) {
    return Math.min(1.8, Math.max(0.45, Number(value.toFixed(2))));
  }

  function updateScaleDraft(value: number) {
    setPendingScale(clampScale(value));
  }

  function applyScale(value = pendingScale) {
    return updateSettings({ scale: clampScale(value) });
  }

  function clampBubbleScrollFactor(value: number) {
    return Number(Math.min(
      BUBBLE_SCROLL_SPEED_FACTOR_RANGE.max,
      Math.max(BUBBLE_SCROLL_SPEED_FACTOR_RANGE.min, Number.isFinite(value) ? value : 1)
    ).toFixed(2));
  }

  function speedToBubbleScrollFactor(speed: number) {
    return clampBubbleScrollFactor(speed / DEFAULT_BUBBLE_SCROLL_SPEED);
  }

  function bubbleScrollSpeedFactor() {
    return speedToBubbleScrollFactor(settings.bubbleScrollSpeed);
  }

  function updateBubbleScrollSpeedDraft(value: number) {
    setPendingBubbleScrollFactor(clampBubbleScrollFactor(value));
    setBubbleScrollMessage("滚动速度有未保存更改。");
  }

  async function saveBubbleScrollSpeed() {
    await updateSettings({ bubbleScrollSpeed: Number((DEFAULT_BUBBLE_SCROLL_SPEED * pendingBubbleScrollFactor).toFixed(6)) });
    setBubbleScrollMessage("滚动速度已保存。");
  }

  const expectedAssets = assets.costumes.length * assets.moods.length;

  const tabs = [
    ["overview", "总览面板", Activity],
    ["persona", "角色人格", Heart],
    ["assets", "素材状态", Sparkles],
    ["extensions", "扩展接口", Layers],
    ["tts", "TTS 语音", Volume2],
    ["addons", "桌面感知", MonitorUp],
    ["reminders", "陪伴提醒", MessageCircle],
    ["diary", "日记记忆", BookOpen],
    ["conversations", "对话记录", MessageCircle],
    ["health", "健康检查", Activity],
    ["desktop", "桌面行为", MonitorUp],
    ["model", "模型接口", Bot],
    ["system", "系统维护", Power]
  ] as const;
  const reminderLabels: Record<string, string> = {
    water: "喝水提醒",
    sitting: "久坐活动",
    rest: "休息提醒",
    meal: "吃饭提醒",
    sleep: "睡眠提醒",
    inactivity: "长时间无互动",
    eyes: "护眼提醒",
    posture: "坐姿提醒",
    breath: "深呼吸提醒",
    save: "保存提醒",
    moodCheck: "心情关怀",
    wrapUp: "收尾整理"
  };

  const activeTabName = tabs.find(([id]) => id === tab)?.[1] ?? "后台控制台";
  const enabledReminders = Object.values(settings.reminders).filter((item) => item.enabled).length;
  const currentAvatar = resolveAvatarPath(assets, settings);
  const currentCostumeName = assets.costumes.find((item) => item.id === settings.selectedCostume)?.name ?? settings.selectedCostume;
  const healthStatus = systemHealth?.status ?? "warning";
  const hasEnabledGif = assets.gifAnimations.some((gif) => gif.enabled);
  const hasEnabledLive2D = assets.live2dModels.some((model) => model.enabled);
  const appliedScale = Math.round(settings.scale * 100);
  const draftScale = Math.round(pendingScale * 100);
  const scaleHasChanges = appliedScale !== draftScale;
  const draftWindowSize = `${Math.round(360 * pendingScale)} x ${Math.round(620 * pendingScale)}`;
  const scrollSpeedHasChanges = pendingBubbleScrollFactor !== bubbleScrollSpeedFactor();

  return (
    <main className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <img src={assetUrl("assets/icons/elf-sister-q-icon.png", data.appPath)} alt="桌面陪伴精灵图标" />
          <div>
            <strong>桌面陪伴精灵</strong>
            <span>后台控制台 · v{APP_VERSION}</span>
          </div>
        </div>
        <nav className="admin-nav" aria-label="后台导航">
          {tabs.map(([id, name, Icon], index) => (
            <button key={id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>
              <span><Icon size={18} /> {name}</span>
              <small>{index + 1}</small>
            </button>
          ))}
        </nav>
        <div className="admin-side-note">
          <strong>设计原则</strong>
          <p>左侧负责功能分区，顶部放全局动作，中间处理配置，右侧展示运行状态和高频控制。</p>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <h1>{activeTabName}</h1>
            <p>当前形象：{currentCostumeName} / {moodLabels[settings.selectedMood]}，{settings.model.enabled ? "模型接口已启用" : "当前使用本地回复"}。</p>
          </div>
          <div className="admin-actions">
            <button onClick={refreshRuntimeState}>刷新数据</button>
            <button onClick={refreshSystemHealth}>运行健康检查</button>
            <button onClick={testModelFromHealth}>测试模型</button>
            <button className="primary" onClick={saveAllSettings}>保存全部设置</button>
          </div>
        </header>

        <div className="admin-content">
          <div className={`admin-dashboard ${tab === "addons" || tab === "tts" ? "wide" : ""}`}>
            <section className="admin-content-card">
        {tab === "overview" && (
          <div className="section">
            <h2>后台总览</h2>
            <div className="admin-hero">
              <div className="admin-avatar-preview">
                <img src={assetUrl(currentAvatar, data.appPath)} onError={(event) => { event.currentTarget.src = assetUrl(assets.defaultAvatar, data.appPath); }} alt="当前形象预览" />
              </div>
              <div>
                <div className="status-row">
                  <span className="status-pill ok">素材完整</span>
                  <span className="status-pill ok">本地回复可用</span>
                  <span className={`status-pill ${settings.model.enabled ? "ok" : "warn"}`}>{settings.model.enabled ? "模型已启用" : "模型未启用"}</span>
                  <span className="status-pill">当前服装：{currentCostumeName}</span>
                </div>
                <h3>功能优先的后台布局</h3>
                <p className="hint">这里已经按预览页结构连接到真实后台：全局刷新、健康检查、模型测试、桌宠大小、桌面行为、日记记忆和系统维护都会调用现有接口。</p>
              </div>
            </div>
            <div className="overview-grid">
              <article>
                <strong>桌宠显示</strong>
                <span>{rendererLabels[settings.extensions.activeRenderer]} · {moodLabels[settings.selectedMood]}</span>
                <p>形象大小 {appliedScale}%，透明度 {Math.round(settings.opacity * 100)}%，{settings.alwaysOnTop ? "保持置顶" : "普通窗口层"}。</p>
              </article>
              <article>
                <strong>陪伴提醒</strong>
                <span>{Object.values(settings.reminders).filter((item) => item.enabled).length} 项已开启</span>
                <p>主动冒泡{settings.proactiveBubbles.enabled ? `已开启，每 ${settings.proactiveBubbles.minutes} 分钟检测一次` : "已关闭"}。</p>
              </article>
              <article>
                <strong>日记本</strong>
                <span>{keyPoints.length} 条关键点</span>
                <p>支持手动记录、聊天触发记录，以及往期问题检索。</p>
              </article>
              <article>
                <strong>模型接口</strong>
                <span>{settings.model.enabled ? providerLabels[settings.model.provider] : "当前使用本地回复"}</span>
                <p>API Key {secretStatus?.hasApiKey ? "已填写" : "未填写"}，接口测试可在模型页或健康检查页执行。</p>
              </article>
              <article>
                <strong>稳定性底座</strong>
                <span>{systemHealth ? healthLabel(systemHealth.status) : "等待检查"}</span>
                <p>已接入健康检查、运行日志、备份、便携目录和数据恢复能力。</p>
              </article>
              <article>
                <strong>数据管理</strong>
                <span>清除记录 / 恢复出厂</span>
                <p>可在系统设置中清空历史记录，或恢复默认设置和空密钥状态。</p>
              </article>
            </div>
            <div className="background-story">
              <div>
                <h3>背景故事</h3>
              </div>
              <div className="story-copy">
                {BACKGROUND_STORY.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </div>
            <h3>规划功能落地清单</h3>
            <div className="feature-list">
              <div><strong>自由聊天入口</strong><span>已实现</span><p>桌宠窗口支持输入、发送、历史上下文和本地回退。</p></div>
              <div><strong>主动冒泡</strong><span>已实现</span><p>待机超过阈值后，从主动冒泡文案池随机显示陪伴话语。</p></div>
              <div><strong>定时提醒</strong><span>已实现</span><p>喝水、休息、护眼、坐姿、长时间无互动等提醒可单独开关和调整间隔。</p></div>
              <div><strong>日记本关键点</strong><span>已实现</span><p>支持手动记录、聊天关键词触发、模型摘要预留和往期检索。</p></div>
              <div><strong>模型接口</strong><span>已实现</span><p>支持粘贴链接、标准端点转换、API Key 本地密钥文件和连接测试。</p></div>
              <div><strong>健康检查</strong><span>已实现</span><p>检查数据、素材、回复库、提醒、日记本、模型配置和运行环境。</p></div>
              <div><strong>便携打包</strong><span>已实现</span><p>数据、日志、素材和人格文档会随 Elf Sister 文件夹迁移。</p></div>
              <div><strong>Live2D / GIF 扩展</strong><span>接口预留</span><p>后台已有选择入口，实际渲染引擎可在后续接入。</p></div>
            </div>
          </div>
        )}

        {tab === "persona" && (
          <div className="section">
            <h2>角色人格</h2>
            <div className="toolbar">
              <button onClick={refreshPersona}><RefreshCw size={16} />刷新身份文档</button>
              <button className="primary" onClick={savePersona}>保存人格</button>
              <button className="danger" onClick={resetPersona}><RotateCcw size={16} />重置人格</button>
              <button onClick={() => window.companionAPI.sendMessage("你好妹妹").then(setTestReply)}><Play size={16} />测试问候</button>
            </div>
            <div className="identity-editor">
              <Field label="角色名称">
                <input value={settings.identity.characterName} placeholder="桌面陪伴精灵妹妹" onChange={(event) => updateIdentity({ characterName: event.target.value })} />
              </Field>
              <Field label="自称">
                <input value={settings.identity.selfReference} placeholder="妹妹" onChange={(event) => updateIdentity({ selfReference: event.target.value })} />
              </Field>
              <Field label="用户称呼">
                <input value={settings.identity.userAddress} placeholder="哥哥" onChange={(event) => updateIdentity({ userAddress: event.target.value })} />
              </Field>
            </div>
            <p className="hint">角色基础信息会优先注入大模型提示；背景故事只在后台首页展示，不作为人格内容。</p>
            <textarea value={persona} onChange={(event) => setPersona(event.target.value)} />
            <p className="hint">身份文档位置：identity/persona.md。这里的内容会作为大模型系统提示词来源；模型也会在明确涉及称呼、语气、人设偏好时追加“对话适配记录”。</p>
            {personaMessage && <div className="reply-preview">{personaMessage}</div>}
            {testReply && <div className="reply-preview">{testReply.text}</div>}
          </div>
        )}

        {tab === "assets" && (
          <div className="section">
            <h2>素材与状态</h2>
            <div className="grid two">
              <Field label="当前服装">
                <select value={settings.selectedCostume} onChange={(e) => updateSettings({ selectedCostume: e.target.value })}>
                  {assets.costumes.filter((c) => c.enabled).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="当前心情">
                <select value={settings.selectedMood} onChange={(e) => updateSettings({
                  selectedMood: e.target.value as MoodId,
                  selectedBubble: assets.moods.find((m) => m.id === e.target.value)?.bubble ?? settings.selectedBubble
                })}>
                  {assets.moods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="asset-preview">
              <img src={assetUrl(resolveAvatarPath(assets, settings), data.appPath)} onError={(event) => { event.currentTarget.src = assetUrl(assets.defaultAvatar, data.appPath); }} alt="当前立绘" />
              <div>
                <h3>素材完整度</h3>
                <p>规划立绘位：{expectedAssets} 项</p>
                <p>已生成立绘：{health?.generatedAvatars.existing ?? "-"} 项</p>
                <p>气泡样式：{assets.bubbles.length} 项</p>
                <p className="hint">优先使用 generated PNG；未生成时自动回退默认预览图。</p>
              </div>
            </div>
            <div className="bubble-list">
              {assets.bubbles.map((bubble) => <button key={bubble.id} onClick={() => updateSettings({ selectedBubble: bubble.id })}>{bubble.name}</button>)}
            </div>
          </div>
        )}

        {tab === "extensions" && (
          <div className="section">
            <h2>扩展接口</h2>
            <div className="grid two">
              <Field label="渲染模式">
                <select value={settings.extensions.activeRenderer} onChange={(e) => updateExtensions({ activeRenderer: e.target.value as AvatarRenderer })}>
                  <option value="static">静态立绘</option>
                  <option value="gif" disabled={!hasEnabledGif}>GIF 动图{hasEnabledGif ? "" : "（未启用素材）"}</option>
                  <option value="live2d" disabled={!hasEnabledLive2D}>Live2D{hasEnabledLive2D ? "" : "（未启用模型）"}</option>
                </select>
              </Field>
              <Field label="优先使用生成 PNG">
                <input type="checkbox" checked={settings.extensions.preferGeneratedAvatars} onChange={(e) => updateExtensions({ preferGeneratedAvatars: e.target.checked })} />
              </Field>
              <Field label="当前服装">
                <select value={settings.extensions.activeCostumePack} onChange={(e) => updateExtensions({ activeCostumePack: e.target.value })}>
                  {assets.costumePacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
                </select>
              </Field>
              <Field label="Live2D 模型">
                <select value={settings.extensions.activeLive2DModel ?? ""} onChange={(e) => updateExtensions({ activeLive2DModel: e.target.value })}>
                  {assets.live2dModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                </select>
              </Field>
              <Field label="GIF 动图">
                <select value={settings.extensions.activeGifAnimation ?? ""} onChange={(e) => updateExtensions({ activeGifAnimation: e.target.value })}>
                  {assets.gifAnimations.map((gif) => <option key={gif.id} value={gif.id}>{gif.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="extension-grid">
              <div><strong>服装包</strong><span>{health?.costumePacks.enabled ?? 0}/{health?.costumePacks.total ?? 0}</span></div>
              <div><strong>服装</strong><span>{assets.costumes.filter((item) => item.enabled).length}/{assets.costumes.length}</span></div>
              <div><strong>心情</strong><span>{assets.moods.length}</span></div>
              <div><strong>Live2D</strong><span>{health?.live2dModels.enabled ?? 0}/{health?.live2dModels.total ?? 0}</span></div>
              <div><strong>GIF</strong><span>{health?.gifAnimations.enabled ?? 0}/{health?.gifAnimations.total ?? 0}</span></div>
              <div><strong>生成立绘</strong><span>{health?.generatedAvatars.existing ?? 0}/{health?.generatedAvatars.expected ?? 0}</span></div>
            </div>
            <div className="toolbar">
              <button onClick={() => window.companionAPI.openProjectFolder("assets/packs")}><FolderOpen size={16} />打开扩展素材文件夹</button>
              <button onClick={() => window.companionAPI.openProjectFolder("assets/avatars")}><FolderOpen size={16} />打开基础立绘文件夹</button>
              <button onClick={refreshRuntimeState}><RefreshCw size={16} />刷新素材配置</button>
              <button onClick={refreshSystemHealth}><Activity size={16} />检查扩展素材</button>
            </div>
            <div className="extension-guide">
              <article>
                <strong>新增服装接口</strong>
                <p>在 <code>data/assets.json</code> 的 <code>costumes</code> 增加服装，并把 id 加入对应 <code>costumePacks.costumeIds</code>。</p>
              </article>
              <article>
                <strong>新增心情接口</strong>
                <p>在 <code>moods</code> 增加心情 id、名称和气泡 id；回复规则、提醒、主动冒泡可直接引用这个心情 id。</p>
              </article>
              <article>
                <strong>立绘命名接口</strong>
                <p>默认读取 <code>assets/avatars/generated/{"{costume}_{mood}"}.png</code>，特殊文件可写入 <code>avatarOverrides</code>。</p>
              </article>
            </div>
            <p className="hint">新增资源后点击“运行健康检查”，系统会检查服装、心情、气泡、回复规则和立绘矩阵是否完整。</p>
          </div>
        )}
        {tab === "tts" && (
          <div className="section">
            <h2>TTS 语音</h2>
            <div className="tts-preset-bar">
              {ttsPresets.map((preset) => (
                <button key={preset.id} title={preset.hint} onClick={() => applyTtsPreset(preset)}>
                  {preset.label}
                </button>
              ))}
            </div>
            <section className="addon-panel">
              <div className="addon-head">
                <div>
                  <strong>文字转语音</strong>
                  <span>{settings.addons.tts.enabled ? "已开启" : "默认关闭"}</span>
                </div>
                <button className={settings.addons.tts.enabled ? "on" : ""} onClick={() => updateTtsAddon({ enabled: !settings.addons.tts.enabled })}>
                  {settings.addons.tts.enabled ? "关闭" : "开启"}
                </button>
              </div>
              <div className="tts-quick-grid">
                <Field label="TTS 方案">
                  <select value={settings.addons.tts.provider} onChange={(e) => applyTtsProvider(e.target.value as AppSettings["addons"]["tts"]["provider"])}>
                    <option value="minimax">MiniMax 同步合成</option>
                    <option value="openai">OpenAI TTS</option>
                    <option value="azure">Azure 语音</option>
                    <option value="elevenlabs">ElevenLabs</option>
                    <option value="doubao">豆包/火山</option>
                    <option value="aliyun">阿里云 TTS</option>
                    <option value="tencent">腾讯云 TTS</option>
                    <option value="xunfei">讯飞 TTS</option>
                    <option value="custom">自定义 API 接口</option>
                  </select>
                </Field>
                <Field label="API Key">
                  <input type="password" value={settings.addons.tts.remoteApiKey} placeholder="API Key / Bearer ... / 服务商鉴权值" onChange={(e) => updateTtsAddon({ remoteApiKey: e.target.value })} />
                </Field>
                <Field label="模型">
                  <input list="tts-model-options" value={settings.addons.tts.model} placeholder="speech-2.8-hd / gpt-4o-mini-tts" onChange={(e) => updateTtsAddon({ model: e.target.value })} />
                  <datalist id="tts-model-options">
                    {ttsModelOptions.map((model) => <option key={model} value={model} />)}
                  </datalist>
                </Field>
                <Field label="音色 ID">
                  <input list="tts-voice-options" value={settings.addons.tts.voice} placeholder="male-qn-qingse / alloy / zh-CN-XiaoxiaoNeural" onChange={(e) => updateTtsAddon({ voice: e.target.value })} />
                  <datalist id="tts-voice-options">
                    {ttsVoiceOptions.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}
                  </datalist>
                </Field>
                <Field label="语速">
                  <input type="number" min="0.5" max="2" step="0.1" value={settings.addons.tts.rate} onChange={(e) => updateTtsAddon({ rate: Number(e.target.value) })} />
                </Field>
                <Field label="音调">
                  <input type="number" min="-12" max="12" value={settings.addons.tts.pitch} onChange={(e) => updateTtsAddon({ pitch: Number(e.target.value) })} />
                </Field>
                <Field label="音量">
                  <input type="number" min="0" max="100" value={settings.addons.tts.volume} onChange={(e) => updateTtsAddon({ volume: Number(e.target.value) })} />
                </Field>
                <Field label="情绪">
                  <select value={settings.addons.tts.emotion} onChange={(e) => updateTtsAddon({ emotion: e.target.value })}>
                    <option value="">自动</option>
                    <option value="happy">happy</option>
                    <option value="sad">sad</option>
                    <option value="angry">angry</option>
                    <option value="fearful">fearful</option>
                    <option value="disgusted">disgusted</option>
                    <option value="surprised">surprised</option>
                    <option value="calm">calm</option>
                    <option value="fluent">fluent</option>
                    <option value="whisper">whisper</option>
                  </select>
                </Field>
              </div>
              <datalist id="tts-url-options">
                {ttsUrlOptions.map((url) => <option key={url} value={url} />)}
              </datalist>
              <datalist id="tts-auth-header-options">
                {ttsAuthHeaderOptions.map((header) => <option key={header} value={header} />)}
              </datalist>
              <datalist id="tts-content-type-options">
                {ttsContentTypeOptions.map((contentType) => <option key={contentType} value={contentType} />)}
              </datalist>
              <datalist id="tts-audio-field-options">
                {ttsAudioFieldOptions.map((field) => <option key={field} value={field} />)}
              </datalist>
              <div className="tts-switch-grid">
                <label><input type="checkbox" checked={settings.addons.tts.localEnabled} onChange={(e) => updateTtsAddon({ localEnabled: e.target.checked })} /> Windows 本地朗读</label>
                <label><input type="checkbox" checked={settings.addons.tts.speakLocalReplies} onChange={(e) => updateTtsAddon({ speakLocalReplies: e.target.checked })} /> 朗读本地回复</label>
                <label><input type="checkbox" checked={settings.addons.tts.speakModelReplies} onChange={(e) => updateTtsAddon({ speakModelReplies: e.target.checked })} /> 朗读模型回复</label>
                <label><input type="checkbox" checked={settings.addons.tts.interruptOnNewReply} onChange={(e) => updateTtsAddon({ interruptOnNewReply: e.target.checked })} /> 新回复打断旧语音</label>
                <label><input type="checkbox" checked={settings.addons.tts.cacheEnabled} onChange={(e) => updateTtsAddon({ cacheEnabled: e.target.checked })} /> 缓存重复短句</label>
              </div>
              {settings.addons.tts.localEnabled && (
                <details className="tts-advanced">
                  <summary>Windows 本地语音</summary>
                  <Field label="系统音色">
                    <select value={settings.addons.tts.voice} onChange={(e) => updateTtsAddon({ voice: e.target.value })}>
                      <option value="">系统默认</option>
                      {ttsVoices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}{voice.culture ? ` / ${voice.culture}` : ""}</option>)}
                    </select>
                  </Field>
                </details>
              )}
              {settings.addons.tts.provider === "minimax" && !settings.addons.tts.localEnabled && (
                <details className="tts-advanced">
                  <summary>MiniMax 音频参数</summary>
                  <div className="addon-form">
                    <Field label="接口 URL">
                      <input list="tts-url-options" value={settings.addons.tts.remoteUrl} placeholder="https://api-bj.minimaxi.com/v1/t2a_v2" onChange={(e) => updateTtsAddon({ remoteUrl: e.target.value })} />
                    </Field>
                    <Field label="语言增强">
                      <input value={settings.addons.tts.languageBoost} placeholder="auto / Chinese / English" onChange={(e) => updateTtsAddon({ languageBoost: e.target.value })} />
                    </Field>
                    <Field label="格式">
                      <select value={settings.addons.tts.audioFormat} onChange={(e) => updateTtsAddon({ audioFormat: e.target.value as AppSettings["addons"]["tts"]["audioFormat"] })}>
                        <option value="mp3">mp3</option>
                        <option value="wav">wav</option>
                        <option value="flac">flac</option>
                        <option value="pcm">pcm</option>
                        <option value="opus">opus</option>
                      </select>
                    </Field>
                    <Field label="采样率">
                      <input type="number" value={settings.addons.tts.sampleRate} onChange={(e) => updateTtsAddon({ sampleRate: Number(e.target.value) })} />
                    </Field>
                    <Field label="比特率">
                      <input type="number" value={settings.addons.tts.bitrate} onChange={(e) => updateTtsAddon({ bitrate: Number(e.target.value) })} />
                    </Field>
                    <Field label="声道">
                      <select value={settings.addons.tts.channel} onChange={(e) => updateTtsAddon({ channel: Number(e.target.value) as AppSettings["addons"]["tts"]["channel"] })}>
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                      </select>
                    </Field>
                  </div>
                </details>
              )}
              {settings.addons.tts.provider !== "minimax" && !settings.addons.tts.localEnabled && (
                <details className="tts-advanced" open>
                  <summary>{ttsPresets.find((preset) => preset.provider === settings.addons.tts.provider)?.label ?? "自定义 API 接口"}</summary>
                  <div className="addon-form">
                    <Field label="接口 URL">
                      <input list="tts-url-options" value={settings.addons.tts.remoteUrl} placeholder="https://api.example.com/tts" onChange={(e) => updateTtsAddon({ remoteUrl: e.target.value })} />
                    </Field>
                    <Field label="请求方法">
                      <select value={settings.addons.tts.remoteMethod} onChange={(e) => updateTtsAddon({ remoteMethod: e.target.value as AppSettings["addons"]["tts"]["remoteMethod"] })}>
                        <option value="POST">POST</option>
                        <option value="GET">GET</option>
                      </select>
                    </Field>
                    <Field label="鉴权 Header">
                      <input list="tts-auth-header-options" value={settings.addons.tts.remoteAuthHeader} placeholder="Authorization" onChange={(e) => updateTtsAddon({ remoteAuthHeader: e.target.value })} />
                    </Field>
                    <Field label="Content-Type">
                      <input list="tts-content-type-options" value={settings.addons.tts.remoteContentType} onChange={(e) => updateTtsAddon({ remoteContentType: e.target.value })} />
                    </Field>
                    <Field label="音频字段">
                      <input list="tts-audio-field-options" value={settings.addons.tts.remoteAudioField} placeholder="audio" onChange={(e) => updateTtsAddon({ remoteAudioField: e.target.value })} />
                    </Field>
                  </div>
                  <Field label="请求体模板">
                    <textarea className="compact-textarea" value={settings.addons.tts.remoteBodyTemplate} onChange={(e) => updateTtsAddon({ remoteBodyTemplate: e.target.value })} />
                  </Field>
                  <p className="hint">模板支持 {"{{text}}"}、{"{{voice}}"}、{"{{model}}"}、{"{{rate}}"}、{"{{pitch}}"}、{"{{volume}}"}。响应可返回 audio/*、音频 URL、data URL、base64 或 hex。</p>
                </details>
              )}
              <Field label="最多朗读字数">
                <input type="number" min="20" max="10000" value={settings.addons.tts.maxChars} onChange={(e) => updateTtsAddon({ maxChars: Number(e.target.value) })} />
              </Field>
              <Field label="请求间隔毫秒">
                <input type="number" min="500" max="10000" step="100" value={settings.addons.tts.minIntervalMs} onChange={(e) => updateTtsAddon({ minIntervalMs: Number(e.target.value) })} />
              </Field>
              <div className="toolbar">
                <button onClick={testTts}><Play size={16} />测试朗读</button>
                <button onClick={stopTts}><Square size={16} />停止</button>
              </div>
              {ttsMessage && <div className="reply-preview">{ttsMessage}</div>}
            </section>
          </div>
        )}
        {tab === "addons" && (
          <div className="section">
            <h2>桌面感知</h2>
            <div className="addon-grid">
              <section className="addon-panel">
                <div className="addon-head">
                  <div>
                    <strong>桌面感知</strong>
                    <span>{screenAwareness.enabled ? "草稿：已开启" : "草稿：默认关闭"}</span>
                  </div>
                  <button className={screenAwareness.enabled ? "on" : ""} onClick={() => updateScreenAwarenessDraft({ enabled: !screenAwareness.enabled })}>
                    {screenAwareness.enabled ? "关闭" : "开启"}
                  </button>
                </div>
                <div className="addon-form">
                  <Field label="触发方式">
                    <select value={screenAwareness.mode} onChange={(e) => updateScreenAwarenessDraft({ mode: e.target.value as AppSettings["addons"]["screenAwareness"]["mode"] })}>
                    <option value="manual">仅手动分析</option>
                      <option value="interval">手动 + 低频间隔</option>
                    </select>
                  </Field>
                  <Field label="间隔秒数">
                    <input type="number" min="30" value={screenAwareness.intervalSeconds} onChange={(e) => updateScreenAwarenessDraft({ intervalSeconds: Number(e.target.value) })} />
                  </Field>
                  <Field label="模型模式">
                    <select value={screenAwareness.providerMode} onChange={(e) => updateScreenAwarenessDraft({ providerMode: e.target.value as AppSettings["addons"]["screenAwareness"]["providerMode"] })}>
                      <option value="reuse-model">复用模型接口</option>
                      <option value="separate-vision">单独视觉配置</option>
                    </select>
                  </Field>
                  <Field label="最大截图宽">
                    <input type="number" min="320" max="2560" value={screenAwareness.maxImageWidth} onChange={(e) => updateScreenAwarenessDraft({ maxImageWidth: Number(e.target.value) })} />
                  </Field>
                  <Field label="视觉模型类型">
                    <select
                      value=""
                      onChange={(e) => e.target.value ? applyVisionModelPreset(e.target.value) : undefined}
                    >
                      <option value="">选择预设，不限制模型名</option>
                      {visionModelPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                    </select>
                  </Field>
                  <Field label="视觉 Provider">
                    <select value={screenAwareness.visionModel.provider} onChange={(e) => updateVisionProvider(e.target.value as ModelProvider)}>
                      {Object.entries(providerLabels)
                        .filter(([id]) => !["mock", "ollama", "lmstudio"].includes(id))
                        .map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="视觉模型">
                    <input list="vision-model-options" value={screenAwareness.visionModel.model} placeholder="可手动填写任意支持图片输入的模型名" onChange={(e) => updateVisionModel({ model: e.target.value })} />
                    <datalist id="vision-model-options">
                      {visionModelPresets.map((preset) => <option key={preset.id} value={preset.model}>{preset.label}</option>)}
                      <option value="qwen-vl-max">千问视觉</option>
                      <option value="qwen-vl-plus">千问视觉 Plus</option>
                      <option value="MiniMax-M1">MiniMax 视觉</option>
                      <option value="gpt-4o-mini">OpenAI 视觉</option>
                      <option value="glm-4v-flash">智谱视觉</option>
                      <option value="Qwen/Qwen2.5-VL-72B-Instruct">硅基多模态</option>
                    </datalist>
                  </Field>
                  <Field label="视觉接口链接">
                    <input value={screenAwareness.visionModel.url ?? ""} placeholder="https://api.example.com" onChange={(e) => updateVisionModel({ url: e.target.value, baseURL: normalizeModelUrl(screenAwareness.visionModel.provider, e.target.value) })} />
                  </Field>
                  <Field label={`视觉 API Key：${secretStatus?.hasVisionApiKey ? "已填写" : "未填写"}`}>
                    <input type="password" value={visionApiKeyInput} placeholder={secretStatus?.hasVisionApiKey ? "输入新 Key 可覆盖" : "单独视觉模型的 API Key"} onChange={(e) => setVisionApiKeyInput(e.target.value)} />
                  </Field>
                  <Field label="启用独立视觉模型">
                    <input type="checkbox" checked={screenAwareness.visionModel.enabled} onChange={(e) => updateVisionModel({ enabled: e.target.checked })} />
                  </Field>
                </div>
                <div className="toolbar">
                  {visionModelPresets.map((preset) => (
                    <button key={preset.id} title={preset.hint} onClick={() => applyVisionModelPreset(preset.id)}>
                      {preset.label}
                    </button>
                  ))}
                  <button onClick={saveVisionApiKey}>保存视觉 Key</button>
                </div>
                <Field label="分析提示">
                  <textarea className="compact-textarea" value={screenAwareness.prompt} onChange={(e) => updateScreenAwarenessDraft({ prompt: e.target.value })} />
                </Field>
                <div className="toolbar">
                  <button className="primary" onClick={saveScreenAwarenessSettings}>保存桌面感知设置</button>
                  <button onClick={runScreenAnalysis}><MonitorUp size={16} />分析当前屏幕</button>
                </div>
                {screenAwarenessMessage && <div className="reply-preview">{screenAwarenessMessage}</div>}
                {screenAnalysis && (
                  <div className="reply-preview">
                    <p>{screenAnalysis.text}</p>
                  </div>
                )}
                <p className="hint">桌面感知默认关闭；开启后才会截图。复用模型接口适合同一端点下的视觉模型；如果视觉模型需要不同接口、模型名或 Key，请使用单独视觉配置。</p>
              </section>
            </div>
          </div>
        )}

        {tab === "reminders" && (
          <div className="section">
            <h2>陪伴提醒</h2>
            <div className="toolbar">
              <button className="primary" onClick={saveReminderSettings} disabled={!remindersDirty}>保存提醒设置</button>
              <span className={remindersDirty ? "status-pill warn" : "status-pill ok"}>{remindersDirty ? "有未保存更改" : "已同步"}</span>
            </div>
            {Object.entries(reminders).map(([id, reminder]) => (
              <div className="reminder-row" key={id}>
                <input type="checkbox" checked={reminder.enabled} onChange={(e) => updateReminderDraft(id, { enabled: e.target.checked })} />
                <strong>{data.reminderMessages[id]?.label ?? reminderLabels[id] ?? id}</strong>
                <input type="number" value={reminder.minutes} min={1} onChange={(e) => updateReminderDraft(id, { minutes: Number(e.target.value) })} />
                <input value={data.reminderMessages[id]?.message ?? reminder.message ?? ""} readOnly />
              </div>
            ))}
            <h3>主动冒泡</h3>
            <div className="reminder-row">
              <input type="checkbox" checked={proactiveBubbles.enabled} onChange={(e) => updateProactiveBubblesDraft({ enabled: e.target.checked })} />
              <strong>待机冒泡</strong>
              <input type="number" value={proactiveBubbles.minutes} min={1} onChange={(e) => updateProactiveBubblesDraft({ minutes: Number(e.target.value) })} />
              <input value={`至少无互动 ${proactiveBubbles.minIdleMinutes} 分钟后，从 ${data.idleBubbles.length} 条文案中随机出现`} readOnly />
            </div>
            <div className="reminder-row">
              <span />
              <strong>无互动阈值</strong>
              <input type="number" value={proactiveBubbles.minIdleMinutes} min={1} onChange={(e) => updateProactiveBubblesDraft({ minIdleMinutes: Number(e.target.value) })} />
              <input value="主动冒泡不属于提醒，也不保存为聊天记录。" readOnly />
            </div>
            {remindersMessage && <div className="reply-preview">{remindersMessage}</div>}
            <p className="hint">修改提醒时间后需要保存才会重新安排桌宠计时器；保存完成后，新间隔从保存时刻开始计算。</p>
          </div>
        )}

        {tab === "diary" && (
          <div className="section">
            <h2>日记本</h2>
            <div className="diary-hero">
              <img src={assetUrl(keyPoints.length > 0 ? "assets/notebook/diary-open.png" : "assets/notebook/diary-closed.png", data.appPath)} alt="日记" />
              <div>
                <h3>{keyPoints.length > 0 ? "关键点已记录" : "日记本待记录"}</h3>
                <p className="hint">聊天中出现“记住、记一下、关键点、日记、以后、我的习惯、我喜欢、我不喜欢”时，会自动写入关键点。以后询问“之前、上次、记得、日记”等内容时，会优先检索这里。</p>
                <p>当前关键点：{keyPoints.length} 条</p>
              </div>
            </div>
            <div className="reply-test">
              <input value={keyPointInput} onChange={(e) => setKeyPointInput(e.target.value)} placeholder="手动记录一个关键点" />
              <button onClick={addKeyPoint}>记录关键点</button>
              <button onClick={() => window.companionAPI.getKeyPoints().then(setKeyPoints)}>刷新</button>
            </div>
            <div className="key-point-list">
              {keyPoints.length === 0 ? (
                <div className="reply-preview">还没有关键点。可以先手动写一条，或者在聊天里说“记住……”。</div>
              ) : keyPoints.map((point) => (
                <article className="key-point-card" key={point.id}>
                  <div>
                    <strong>{point.title}</strong>
                    <span>{new Date(point.timestamp).toLocaleString()}</span>
                    <button onClick={() => deleteKeyPoint(point.id)}><Trash2 size={14} />删除</button>
                  </div>
                  <p>{point.summary}</p>
                  <small>
                    {keyPointSourceLabels[point.source]} · 等级 {point.importance ?? 2}
                    {point.important ? " · 重要" : ""}
                    {point.tags.length > 0 ? ` · ${point.tags.join(" / ")}` : ""}
                  </small>
                </article>
              ))}
            </div>
          </div>
        )}

        {tab === "conversations" && (
          <div className="section">
            <h2>对话记录</h2>
            <div className="toolbar">
              <button onClick={() => window.companionAPI.getRecentConversations().then(setRecentConversations)}><RefreshCw size={16} />刷新</button>
              <span className="status-pill">最近 {recentConversations.length}/40 轮</span>
            </div>
            <div className="conversation-list">
              {recentConversations.length === 0 ? (
                <div className="reply-preview">暂无聊天记录。开启“保存聊天记录”后，新的自由聊天会显示在这里。</div>
              ) : recentConversations.map((record, index) => (
                <article className="conversation-card" key={record.id}>
                  <div className="conversation-card-head">
                    <strong>第 {recentConversations.length - index} 轮</strong>
                    <span>{new Date(record.timestamp).toLocaleString()} · {providerLabels[record.provider]} / {replySourceLabels[record.source]}</span>
                  </div>
                  <div className="conversation-turn user">
                    <strong>用户</strong>
                    <p>{record.input}</p>
                  </div>
                  <div className="conversation-turn assistant">
                    <strong>精灵</strong>
                    <p>{record.output}</p>
                  </div>
                  <small>{replyTypeLabels[record.category] ?? record.category} · {moodLabels[record.mood]}</small>
                </article>
              ))}
            </div>
          </div>
        )}

        {tab === "health" && (
          <div className="section">
            <h2>健康检查</h2>
            <div className={`health-banner ${systemHealth?.status ?? "warning"}`}>
              <div>
                <strong>{systemHealth ? healthLabel(systemHealth.status) : "未检查"}</strong>
                <p>{systemHealth ? `检查时间：${new Date(systemHealth.checkedAt).toLocaleString()}` : "点击刷新检查当前项目状态"}</p>
              </div>
              <button onClick={refreshSystemHealth}><RefreshCw size={16} />刷新检查</button>
              <button onClick={testModelFromHealth}>测试模型</button>
            </div>
            {healthModelTest && (
              <div className="reply-preview">
                <strong>{providerLabels[healthModelTest.provider]} / {replySourceLabels[healthModelTest.source]}</strong>
                <p>{healthModelTest.text}</p>
                {typeof healthModelTest.details?.modelError === "string" && <small>错误：{healthModelTest.details.modelError}</small>}
              </div>
            )}
            {systemHealth && (
              <>
                <div className="health-summary">
                  {Object.entries(systemHealth.summary).map(([key, value]) => (
                    <div key={key}>
                      <strong>{healthSummaryLabels[key] ?? key}</strong>
                      <span>{typeof value === "boolean" ? yesNo(value) : String(value)}</span>
                    </div>
                  ))}
                </div>
                <div className="health-list">
                  {systemHealth.items.map((item) => (
                    <article className={`health-item ${item.status}`} key={item.id}>
                      <div>
                        <strong>{item.label}</strong>
                        <span>{healthLabel(item.status)}</span>
                      </div>
                      <p>{item.message}</p>
                      {item.suggestion && <small>{item.suggestion}</small>}
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "desktop" && (
          <div className="section">
            <h2>桌面行为</h2>
            <div className="grid two">
              <Field label="透明度"><input type="range" min="0.35" max="1" step="0.01" value={settings.opacity} onChange={(e) => updateSettings({ opacity: Number(e.target.value) })} /></Field>
              <Field label="气泡字体大小">
                <input type="number" min="12" max="22" value={settings.bubbleFontSize} onChange={(e) => updateSettings({ bubbleFontSize: Number(e.target.value) })} />
              </Field>
              <div className="size-control scroll-speed-control">
                <div className="size-control-head">
                  <div>
                    <strong>鼠标滚动速度</strong>
                    <span>以当前默认速度为 1x，只影响气泡文字滚动。</span>
                  </div>
                  <em>{pendingBubbleScrollFactor}x</em>
                </div>
                <div className="scale-meta">
                  <span>已保存：{bubbleScrollSpeedFactor()}x</span>
                  <span>草稿：{pendingBubbleScrollFactor}x</span>
                  <span>范围：0.1x - 10x</span>
                  <span className={scrollSpeedHasChanges ? "warn" : "ok"}>{scrollSpeedHasChanges ? "未保存" : "已同步"}</span>
                </div>
                <div className="speed-slider">
                  <span>慢 0.1x</span>
                  <input
                    type="range"
                    min={BUBBLE_SCROLL_SPEED_FACTOR_RANGE.min}
                    max={BUBBLE_SCROLL_SPEED_FACTOR_RANGE.max}
                    step="0.1"
                    value={pendingBubbleScrollFactor}
                    onChange={(e) => updateBubbleScrollSpeedDraft(Number(e.target.value))}
                  />
                  <span>快 10x</span>
                </div>
                <div className="speed-presets">
                  {[0.3, 0.5, 1, 2, 5].map((factor) => (
                    <button key={factor} className={pendingBubbleScrollFactor === factor ? "on" : ""} onClick={() => updateBubbleScrollSpeedDraft(factor)}>{factor}x</button>
                  ))}
                </div>
                <div className="size-actions">
                  <button onClick={() => updateBubbleScrollSpeedDraft(1)}>恢复默认</button>
                  <button onClick={() => updateBubbleScrollSpeedDraft(pendingBubbleScrollFactor - 0.1)}>减慢</button>
                  <button onClick={() => updateBubbleScrollSpeedDraft(pendingBubbleScrollFactor + 0.1)}>加快</button>
                  <button className="primary" onClick={saveBubbleScrollSpeed} disabled={!scrollSpeedHasChanges}>保存滚动速度</button>
                </div>
                {bubbleScrollMessage && <p className="hint">{bubbleScrollMessage}</p>}
              </div>
              <div className="size-control size-control-wide">
                <div className="size-control-head">
                  <div>
                    <strong>调整大小</strong>
                    <span>拖动滑块只修改预设值，点击应用后才同步到桌宠窗。</span>
                  </div>
                  <em>{draftScale}%</em>
                </div>
                <div className="scale-meta">
                  <span>已应用：{appliedScale}%</span>
                  <span>预设大小：{draftScale}%</span>
                  <span>应用后窗口：{draftWindowSize}</span>
                  <span className={scaleHasChanges ? "warn" : "ok"}>{scaleHasChanges ? "有未应用更改" : "已同步"}</span>
                </div>
                <div className="size-slider">
                  <span>45%</span>
                  <input type="range" min="0.45" max="1.8" step="0.05" value={pendingScale} onChange={(e) => updateScaleDraft(Number(e.target.value))} />
                  <span>180%</span>
                </div>
                <div className="scale-presets">
                  {[0.75, 1, 1.25, 1.5].map((scale) => (
                    <button key={scale} className={pendingScale === scale ? "on" : ""} onClick={() => updateScaleDraft(scale)}>{Math.round(scale * 100)}%</button>
                  ))}
                </div>
                <div className="size-actions">
                  <button onClick={() => updateScaleDraft(pendingScale - 0.05)}>减小</button>
                  <button onClick={() => updateScaleDraft(pendingScale + 0.05)}>增大</button>
                  <button onClick={() => updateScaleDraft(1)}>恢复默认</button>
                  <button className="primary" onClick={() => applyScale()} disabled={!scaleHasChanges}>应用大小</button>
                </div>
              </div>
            </div>
            <div className="toggles">
              <button className={settings.alwaysOnTop ? "on" : ""} onClick={() => updateSettings({ alwaysOnTop: !settings.alwaysOnTop })}>置顶</button>
              <button className={settings.locked ? "on" : ""} onClick={() => updateSettings({ locked: !settings.locked })}>锁定位置</button>
              <button className={settings.edgeSnap ? "on" : ""} onClick={() => updateSettings({ edgeSnap: !settings.edgeSnap })}>边缘吸附</button>
              <button onClick={() => window.companionAPI.showCompanion()}><Eye size={16} />显示</button>
              <button onClick={() => window.companionAPI.hideCompanion()}><EyeOff size={16} />隐藏</button>
            </div>
            <p className="hint">应用后会同步调整真实窗口大小、立绘、气泡和输入区比例；拖动桌宠时不会触发缩放。</p>
          </div>
        )}

        {tab === "model" && (
          <div className="section">
            <h2>模型接口</h2>
            <div className="grid two">
              <Field label="启用模型"><input type="checkbox" checked={settings.model.enabled} onChange={(e) => updateSettings({ model: { ...settings.model, enabled: e.target.checked } })} /></Field>
              <Field label="提供商">
                <select value={settings.model.provider} onChange={(e) => {
                  const provider = e.target.value as ModelProvider;
                  const endpoint = normalizeModelUrl(provider, settings.model.url ?? settings.model.baseURL);
                  updateSettings({ model: { ...settings.model, provider, baseURL: endpoint || settings.model.baseURL } });
                }}>
                  {Object.entries(providerLabels).map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </Field>
              <Field label="接口链接">
                <input value={settings.model.url ?? ""} placeholder="粘贴 http://127.0.0.1:11434 或 https://api.example.com" onChange={(e) => updateSettings({ model: { ...settings.model, url: e.target.value } })} />
              </Field>
              <Field label="标准端点">
                <input value={settings.model.baseURL} onChange={(e) => updateSettings({ model: { ...settings.model, baseURL: e.target.value } })} />
              </Field>
              <Field label="Model"><input value={settings.model.model} placeholder="qwen-vl-max / gpt-4o-mini / your-vision-model" onChange={(e) => updateSettings({ model: { ...settings.model, model: e.target.value } })} /></Field>
              <Field label={`API Key：${secretStatus?.hasApiKey ? "已填写" : "未填写"}`}>
                <input type="password" value={apiKeyInput} placeholder={secretStatus?.hasApiKey ? "输入新 Key 可覆盖" : "输入后保存到本地密钥文件"} onChange={(e) => setApiKeyInput(e.target.value)} />
              </Field>
              <Field label="温度"><input type="number" min="0" max="2" step="0.1" value={settings.model.temperature} onChange={(e) => updateSettings({ model: { ...settings.model, temperature: Number(e.target.value) } })} /></Field>
            </div>
            <div className="reply-test">
              <input value={testInput} onChange={(e) => setTestInput(e.target.value)} />
              <button onClick={saveApiKey}>保存 Key</button>
              <button onClick={applyModelUrl}>应用链接</button>
              <button onClick={sendModelTest}>测试回复</button>
              <button onClick={() => window.companionAPI.testModelConnection().then(setTestReply)}>连接测试</button>
            </div>
            <div className="toolbar">
              {modelPresets.map((preset) => (
                <button key={preset.id} title={preset.hint} onClick={() => applyModelPreset(preset.provider, preset.url, preset.model, preset.maxTokens)}>
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="model-capability-list">
              <article><strong>自由聊天</strong><span>模型接管回复文本，失败时自动回退本地回复。</span></article>
              <article><strong>心情立绘</strong><span>模型返回合法 mood 后，桌宠会自动切换对应心情状态。</span></article>
              <article><strong>服装风格</strong><span>模型返回合法 costumeId 时才切换服装；普通聊天默认不乱换。</span></article>
              <article><strong>记忆辅助</strong><span>会把相关日记关键点注入系统提示词，辅助长期陪伴。</span></article>
              <article><strong>多模态模型</strong><span>可填写支持图片输入的视觉模型名；桌面感知复用同一模型时会发送图片输入。</span></article>
            </div>
            <p className="hint">粘贴服务链接后点击“应用链接”，系统会按提供商规范转换到聊天端点。多模态模型通常需要支持图片输入的 OpenAI-compatible 地址，填到兼容接口或单独视觉配置里。</p>
            {testReply && (
              <div className="reply-preview">
                <strong>{providerLabels[testReply.provider]} / {replySourceLabels[testReply.source]}</strong>
                <p>{testReply.text}</p>
                {typeof testReply.details?.modelError === "string" && <small>错误：{testReply.details.modelError}</small>}
              </div>
            )}
          </div>
        )}

        {tab === "system" && (
          <div className="section">
            <h2>系统设置</h2>
            <div className="settings-summary">
              <div><strong>开机自启动</strong><span>{yesNo(settings.autostart)}</span></div>
              <div><strong>保存聊天记录</strong><span>{yesNo(settings.saveConversations)}</span></div>
              <div><strong>角色名称</strong><span>{settings.identity.characterName}</span></div>
              <div><strong>角色自称</strong><span>{settings.identity.selfReference}</span></div>
              <div><strong>用户称呼</strong><span>{settings.identity.userAddress}</span></div>
              <div><strong>工作模式</strong><span>{yesNo(settings.workMode)}</span></div>
              <div><strong>陪伴模式</strong><span>{yesNo(settings.companionMode)}</span></div>
              <div><strong>窗口置顶</strong><span>{yesNo(settings.alwaysOnTop)}</span></div>
              <div><strong>锁定位置</strong><span>{yesNo(settings.locked)}</span></div>
              <div><strong>边缘吸附</strong><span>{yesNo(settings.edgeSnap)}</span></div>
              <div><strong>启动时显示</strong><span>{yesNo(settings.visibleOnStart)}</span></div>
              <div><strong>气泡字体</strong><span>{settings.bubbleFontSize}px</span></div>
              <div><strong>滚动速度</strong><span>{bubbleScrollSpeedFactor()}x</span></div>
              <div><strong>当前服装</strong><span>{assets.costumes.find((item) => item.id === settings.selectedCostume)?.name ?? settings.selectedCostume}</span></div>
              <div><strong>当前心情</strong><span>{moodLabels[settings.selectedMood]}</span></div>
              <div><strong>当前气泡</strong><span>{assets.bubbles.find((item) => item.id === settings.selectedBubble)?.name ?? settings.selectedBubble}</span></div>
              <div><strong>渲染模式</strong><span>{rendererLabels[settings.extensions.activeRenderer]}</span></div>
              <div><strong>模型提供商</strong><span>{providerLabels[settings.model.provider]}</span></div>
              <div><strong>模型状态</strong><span>{yesNo(settings.model.enabled)}</span></div>
              <div><strong>主动冒泡</strong><span>{yesNo(settings.proactiveBubbles.enabled)}</span></div>
              <div><strong>形象大小</strong><span>{appliedScale}%</span></div>
            </div>
            <div className="toggles">
              <button className={settings.autostart ? "on" : ""} onClick={toggleAutostart}>开机自启动</button>
              <button className={settings.saveConversations ? "on" : ""} onClick={() => updateSettings({ saveConversations: !settings.saveConversations })}>保存聊天记录</button>
              <button className={settings.workMode ? "on" : ""} onClick={() => updateSettings({ workMode: !settings.workMode, companionMode: settings.workMode })}>工作模式</button>
              <button className={settings.companionMode ? "on" : ""} onClick={() => updateSettings({ companionMode: !settings.companionMode })}>陪伴模式</button>
            </div>
            <div className="directory-list">
              <p><button onClick={() => window.companionAPI.openProjectFolder("assets/avatars")}><FolderOpen size={16} /> assets/avatars</button></p>
              <p><button onClick={() => window.companionAPI.openProjectFolder("assets/packs")}><FolderOpen size={16} /> assets/packs</button></p>
              <p><button onClick={() => window.companionAPI.openProjectFolder("assets/live2d")}><FolderOpen size={16} /> assets/live2d</button></p>
              <p><button onClick={() => window.companionAPI.openProjectFolder("assets/gifs")}><FolderOpen size={16} /> assets/gifs</button></p>
              <p><FolderOpen size={16} /> identity/persona.md</p>
              <p><FolderOpen size={16} /> data/replies.json</p>
              <p><FolderOpen size={16} /> data/key-points.json</p>
            </div>
            <div className="danger-zone">
              <div>
                <h3>数据管理</h3>
                <p className="hint">清除本地记录只清空历史；恢复出厂设置会重置设置和密钥，但保留素材、回复库和人格文档。</p>
              </div>
              <div className="toolbar">
                <button onClick={clearLocalRecords}><Trash2 size={16} />清除本地记录</button>
                <button className="danger" onClick={resetFactorySettings}><RotateCcw size={16} />恢复出厂设置</button>
              </div>
              {maintenanceMessage && <div className="reply-preview">{maintenanceMessage}</div>}
            </div>
            <h3>回复库预览</h3>
            <div className="reply-library">
              {Object.entries(replies).map(([key, list]) => (
                <article key={key}>
                  <div>
                    <strong>{replyTypeLabels[key] ?? key}</strong>
                    <span>{Array.isArray(list) ? `${list.length} 条` : "格式异常"}</span>
                  </div>
                  <small>绑定状态：{replyRuleById.has(key) ? moodLabels[replyRuleById.get(key)!.mood] : key === "fallback" ? "沿用当前状态" : "未配"}</small>
                  <p>{Array.isArray(list) && list.length > 0 ? list[0] : "暂无可用回复"}</p>
                </article>
              ))}
            </div>
          </div>
        )}
            </section>

            <aside className="admin-right-stack">
              <section className="admin-side-panel">
                <div className="panel-head">
                  <div>
                    <h3>运行状态</h3>
                    <span>后台右侧固定状态区</span>
                  </div>
                  <span className={`state ${healthStatus}`}>{healthLabel(healthStatus)}</span>
                </div>
                <div className="panel-body switch-list">
                  <div className="health-row">
                    <div><strong>JSON 配置</strong><span>{systemHealth ? `${systemHealth.summary.jsonFiles} 个文件已检查` : "等待检查"}</span></div>
                    <span className={`state ${healthStatus === "error" ? "error" : "ok"}`}>{systemHealth ? "已检查" : "待检查"}</span>
                  </div>
                  <div className="health-row">
                    <div><strong>素材引用</strong><span>{assets.costumes.length} 套服装，{assets.bubbles.length} 个气泡</span></div>
                    <span className="state ok">正常</span>
                  </div>
                  <div className="health-row">
                    <div><strong>模型接口</strong><span>{settings.model.enabled ? providerLabels[settings.model.provider] : "当前使用本地回复"}</span></div>
                    <span className={`state ${settings.model.enabled ? "ok" : "warn"}`}>{settings.model.enabled ? "启用" : "本地"}</span>
                  </div>
                </div>
              </section>

              <section className="admin-side-panel">
                <div className="panel-head">
                  <div>
                    <h3>桌面行为</h3>
                    <span>高频开关和当前状态</span>
                  </div>
                </div>
                <div className="panel-body switch-list">
                  <div className="scale-summary-card">
                    <strong>当前大小：{appliedScale}%</strong>
                    <span>真实窗口：{Math.round(360 * settings.scale)} x {Math.round(620 * settings.scale)}</span>
                    <button onClick={() => setTab("desktop")}>打开缩放设置</button>
                  </div>
                  <div className="switch-row">
                    <div><strong>窗口置顶</strong><span>保持桌宠在屏幕前方。</span></div>
                    <button className={`toggle ${settings.alwaysOnTop ? "on" : ""}`} onClick={() => updateSettings({ alwaysOnTop: !settings.alwaysOnTop })} aria-label="窗口置顶"><i /></button>
                  </div>
                  <div className="switch-row">
                    <div><strong>锁定位置</strong><span>防止误拖动。</span></div>
                    <button className={`toggle ${settings.locked ? "on" : ""}`} onClick={() => updateSettings({ locked: !settings.locked })} aria-label="锁定位置"><i /></button>
                  </div>
                  <div className="switch-row">
                    <div><strong>开机自启动</strong><span>随系统启动。</span></div>
                    <button className={`toggle ${settings.autostart ? "on" : ""}`} onClick={toggleAutostart} aria-label="开机自启动"><i /></button>
                  </div>
                  <div className="admin-actions compact">
                    <button onClick={() => window.companionAPI.showCompanion()}>显示精灵</button>
                    <button onClick={() => window.companionAPI.hideCompanion()}>隐藏精灵</button>
                    <button onClick={() => setTab("desktop")}>调整大小</button>
                  </div>
                </div>
              </section>

              <section className="admin-side-panel">
                <div className="panel-head">
                  <div>
                    <h3>日记记忆</h3>
                    <span>关键点记录入口</span>
                  </div>
                  <button onClick={() => window.companionAPI.getKeyPoints().then(setKeyPoints)}>刷新</button>
                </div>
                <div className="panel-body diary-card">
                  <img src={assetUrl(keyPoints.length > 0 ? "assets/notebook/diary-open.png" : "assets/notebook/diary-closed.png", data.appPath)} alt="日记" />
                  <div>
                    <strong>当前关键点：{keyPoints.length} 条</strong>
                    <p className="hint">聊天关键词和手动记录都会写入这里。</p>
                  </div>
                </div>
              </section>

              <section className="admin-side-panel danger-zone">
                <div className="panel-head">
                  <div>
                    <h3>系统维护</h3>
                    <span>危险操作集中在底部</span>
                  </div>
                </div>
                <div className="panel-body switch-list">
                  <button onClick={clearLocalRecords}>清理本地记录</button>
                  <button className="danger" onClick={resetFactorySettings}>恢复出厂设置</button>
                  {maintenanceMessage && <div className="reply-preview">{maintenanceMessage}</div>}
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}

function App() {
  if (windowKind === "admin") return <AdminWindow />;
  return <CompanionWindow />;
}

createRoot(document.getElementById("root")!).render(<App />);


