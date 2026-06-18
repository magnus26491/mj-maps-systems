// Pre-load patch for TurboModuleRegistry
// This must run BEFORE any other JavaScript

(function() {
  if (typeof global !== 'undefined') {
    // Create a mock TurboModuleRegistry that returns empty stubs
    global.TurboModuleRegistry = global.TurboModuleRegistry || {
      _modules: {},
      
      get: function(name) {
        return this._modules[name] || null;
      },
      
      getEnforcing: function(name) {
        var mod = this._modules[name];
        if (!mod) {
          console.warn('[TurboModuleRegistry] Module "' + name + '" not found, returning empty stub');
          // Return an empty stub that won't crash
          return {
            __esModule: true,
            default: {}
          };
        }
        return mod;
      },
      
      register: function(name, module) {
        this._modules[name] = module;
      }
    };
    
    // Also patch the internal React Native module registry
    if (typeof global.__turboModuleRegistry === 'undefined') {
      Object.defineProperty(global, '__turboModuleRegistry', {
        value: {},
        writable: true,
        configurable: true
      });
    }
  }
  
  if (typeof window !== 'undefined') {
    window.TurboModuleRegistry = window.TurboModuleRegistry || global.TurboModuleRegistry;
  }
})();
