/**
 * Voice settings store — persists navigation TTS preferences to AsyncStorage.
 *
 * Language is inferred from the app locale (SPEECH_LANG in i18n.ts) so
 * drivers don't need to set it separately — changing the UI language
 * also changes the voice language automatically.
 *
 * What drivers can customize here:
 *  · voiceId  — specific installed voice (e.g. "com.apple.voice.premium.en-GB.Serena")
 *  · rate     — speaking speed 0.5–1.5 (default 0.9 — slightly slower than normal)
 *  · pitch    — voice pitch 0.5–2.0 (default 1.0)
 *  · volume   — TTS volume 0.0–1.0 (default 1.0)
 *  · enabled  — master on/off for voice navigation
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'mj_voice_prefs';

export interface VoicePrefs {
  voiceId:  string | null;
  rate:     number;
  pitch:    number;
  volume:   number;
  enabled:  boolean;
}

const DEFAULTS: VoicePrefs = {
  voiceId: null,
  rate:    0.9,
  pitch:   1.0,
  volume:  1.0,
  enabled: true,
};

interface VoiceSettingsState extends VoicePrefs {
  isLoaded:   boolean;
  load:       () => Promise<void>;
  setVoiceId: (id: string | null) => void;
  setRate:    (v: number) => void;
  setPitch:   (v: number) => void;
  setVolume:  (v: number) => void;
  setEnabled: (v: boolean) => void;
  reset:      () => void;
}

async function persist(partial: Partial<VoicePrefs>) {
  try {
    const existing = await AsyncStorage.getItem(STORAGE_KEY);
    const current: VoicePrefs = existing ? JSON.parse(existing) : DEFAULTS;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...partial }));
  } catch {}
}

export const useVoiceSettingsStore = create<VoiceSettingsState>((set, get) => ({
  ...DEFAULTS,
  isLoaded: false,

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved: Partial<VoicePrefs> = JSON.parse(raw);
        set({ ...DEFAULTS, ...saved, isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  setVoiceId: (voiceId) => {
    set({ voiceId });
    persist({ voiceId });
  },
  setRate: (rate) => {
    const v = Math.max(0.5, Math.min(1.5, rate));
    set({ rate: v });
    persist({ rate: v });
  },
  setPitch: (pitch) => {
    const v = Math.max(0.5, Math.min(2.0, pitch));
    set({ pitch: v });
    persist({ pitch: v });
  },
  setVolume: (volume) => {
    const v = Math.max(0, Math.min(1, volume));
    set({ volume: v });
    persist({ volume: v });
  },
  setEnabled: (enabled) => {
    set({ enabled });
    persist({ enabled });
  },
  reset: () => {
    set({ ...DEFAULTS });
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  },
}));
