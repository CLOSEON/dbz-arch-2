import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dabzo.app',
  appName: 'Dabzzo',
  webDir: 'out',

  server: {
    androidScheme: 'https'
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      // Every provider the app can actually invoke must be listed here, or the
      // native plugin refuses with "provider is not enabled". auth-service.ts
      // calls signInWithGoogle, signInWithApple and signInWithFacebook in
      // addition to phone, so all four belong in this list.
      providers: ['google.com', 'apple.com', 'facebook.com', 'phone']
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    SplashScreen: {
      launchShowDuration: 1800,
      backgroundColor: "#FEFCE8",
      androidSplashResourceName: "splash",
      showSpinner: false
    }
  }
};

export default config;