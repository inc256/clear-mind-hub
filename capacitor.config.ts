import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.xplainfy.app',
  appName: 'Xplainfy',
  webDir: 'dist',
  server: {
    url: "https://app.xplainfy.net"
  }
};

export default config;
