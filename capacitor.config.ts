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
      // ONLY list providers that are (a) reachable from the UI and (b) have
      // their native dependency present in the Android project.
      //
      // The plugin constructs a handler for EVERY provider listed here during
      // Bridge init, before the web view loads. Listing 'facebook.com' without
      // the Facebook Android SDK on the classpath therefore crashed the app on
      // launch with NoClassDefFoundError on com.facebook.CallbackManager —
      // not at sign-in time, but immediately, so nothing rendered at all.
      //
      // Today only Google is wired to a button; signInWithApple,
      // signInWithFacebook and the phone flow exist in auth-service.ts but
      // have no UI call sites. Add a provider here when its button ships AND
      // its native dependency is added, not before.
      providers: ['google.com']
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