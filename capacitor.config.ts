import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dabzo.app',
  appName: 'Dabzo',
  webDir: 'out',

  server: {
    androidScheme: 'https'
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['phone']
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