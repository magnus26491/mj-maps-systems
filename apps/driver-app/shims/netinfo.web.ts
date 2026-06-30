const state = {
  isConnected: true,
  isInternetReachable: true,
  type: 'wifi' as const,
  details: null,
};

export default {
  fetch: async () => state,
  addEventListener: (_: any, cb: (s: typeof state) => void) => {
    cb(state);
    return () => {};
  },
  configure: () => {},
};
