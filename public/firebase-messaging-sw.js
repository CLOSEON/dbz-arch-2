importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyDDuCCfdoGZUv92B_tgK3ibzOU8io5bee0",
  authDomain: "dabzofb.firebaseapp.com",
  projectId: "dabzofb",
  storageBucket: "dabzofb.firebasestorage.app",
  messagingSenderId: "651368129597",
  appId: "1:651368129597:web:31bd85f34d84e7e23b3654"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
