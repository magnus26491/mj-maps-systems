import { ScrollViewStyleReset } from 'expo-router/html';

/**
 * HTML shell for the Expo Router web build.
 *
 * The inline <script> in <head> runs BEFORE the JS bundle and patches
 * global.TurboModuleRegistry so ExceptionsManager / Timing stubs are
 * available the moment React Native's error-handler initialises.
 * Without this, the RN runtime crashes instantly on any browser because
 * NativeModules is empty and ExceptionsManager cannot be found.
 */
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
        {/* ── TurboModule polyfill — must execute before the RN bundle ── */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  'use strict';
  if(typeof global==='undefined'){window.global=window;}
  var noop=function(){};
  var stubs={
    ExceptionsManager:{handleException:noop,reportFatalException:noop,updateExceptionMessage:noop,dismissRedbox:noop},
    Timing:{createTimer:noop,deleteTimer:noop,setSendIdleEvents:noop},
    UIManager:{getViewManagerConfig:function(){return{};},hasViewManagerConfig:function(){return false;},getConstants:function(){return{};},dispatchViewManagerCommand:noop},
    PlatformConstants:{getConstants:function(){return{isTesting:false,reactNativeVersion:{major:0,minor:74,patch:0}};},forceTouchAvailable:false,interfaceIdiom:'unknown',osVersion:'web',systemName:'web'},
    NativePerformanceCxx:{},
    NativePerformanceObserverCxx:{},
    LogBox:{ignoreAllLogs:noop,ignoreLogs:noop},
    SourceCode:{getConstants:function(){return{scriptURL:''};}}
  };
  var registry={
    _m:{},
    get:function(n){return this._m[n]||stubs[n]||null;},
    getEnforcing:function(n){
      var m=this._m[n]||stubs[n];
      if(!m){console.debug('[TurboModuleRegistry] stub for '+n);m={};}
      return m;
    },
    register:function(n,m){this._m[n]=m;}
  };
  if(!global.TurboModuleRegistry){global.TurboModuleRegistry=registry;}
  if(typeof window!=='undefined'&&!window.TurboModuleRegistry){window.TurboModuleRegistry=registry;}
  /* Ensure browser setTimeout survives — RN runtime may try to overwrite it */
  var _setTimeout=window.setTimeout.bind(window);
  var _clearTimeout=window.clearTimeout.bind(window);
  var _setInterval=window.setInterval.bind(window);
  var _clearInterval=window.clearInterval.bind(window);
  Object.defineProperty(global,'setTimeout',{get:function(){return _setTimeout;},configurable:true});
  Object.defineProperty(global,'clearTimeout',{get:function(){return _clearTimeout;},configurable:true});
  Object.defineProperty(global,'setInterval',{get:function(){return _setInterval;},configurable:true});
  Object.defineProperty(global,'clearInterval',{get:function(){return _clearInterval;},configurable:true});
})();
`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
