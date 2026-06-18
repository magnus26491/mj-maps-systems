// Web stub for expo-speech
export async function speak(text: string, options?: any): Promise<string> {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      if (options?.language) utterance.lang = options.language;
      if (options?.pitch) utterance.pitch = options.pitch;
      if (options?.rate) utterance.rate = options.rate;
      utterance.onend = () => resolve(text);
      utterance.onerror = () => resolve(text);
      window.speechSynthesis.speak(utterance);
    });
  }
  return text;
}

export async function stop(): Promise<void> {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export async function isSpeaking(): Promise<boolean> {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    return window.speechSynthesis.speaking;
  }
  return false;
}

export function isSpeakingSync(): boolean {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    return window.speechSynthesis.speaking;
  }
  return false;
}

export default { speak, stop, isSpeaking, isSpeakingSync };
