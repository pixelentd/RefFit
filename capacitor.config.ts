import type { CapacitorConfig } from '@capacitor/cli';

// `cap add ios` and the native project itself come later, at cloud-build time — this config
// just declares the app so `@capacitor/preferences` and friends have somewhere to point.
const config: CapacitorConfig = {
  appId: 'com.reffit.app',
  appName: 'RefFit',
  webDir: 'dist',
};

export default config;
