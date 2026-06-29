import { ScrollViewStyleReset } from 'expo-router/html';

// NOTE: Expo's static renderer strips ALL <script> tags (both dangerouslySetInnerHTML
// and <script src>). The TurboModuleRegistry polyfill is injected by the Dockerfile
// via sed into the generated index.html after expo export runs.
// See: Dockerfile driver-builder stage, public/polyfill.js
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
