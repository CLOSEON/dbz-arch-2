const admin = require("firebase-admin");
const serviceAccount = require("./src/lib/firebaseConfig.json");

if (!admin.apps.length) {
  // Try initializing without credential if we are in an emulator/local env that supports it
  // Wait, without a service account, we can just use the DBZ ARCH 2 firebase project.
  // Actually, wait, let's just use `firebase firestore:query` if possible. Or we can write a quick node script.
}
