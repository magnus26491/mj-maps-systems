// Web stub for expo-av — browser handles audio natively; no RN Audio module needed.
export const Audio = {
  setAudioModeAsync: async (_options: object) => {},
  Sound: {
    createAsync: async () => ({ sound: { playAsync: async () => {}, unloadAsync: async () => {} }, status: {} }),
  },
};

export const Video = null;

export default { Audio, Video };
