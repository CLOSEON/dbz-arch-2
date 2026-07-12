const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  
  // 1. Force driver active
  await db.collection('driver_profiles').doc('sp80Y9XAKJaMpAUjAFjbrArEaGw2').update({ isActive: true });
  console.log('Driver activated.');

  // 2. We need the matchingTriggers logic! But that's a Cloud Function. 
  // Let's just import the function from matchingTriggers.ts? No, it's compiled to JS.
  const { assignRiderTrips } = require('./lib/matchingTriggers.js');
  
  // Create a mock context for httpsCallable
  const req = { data: { vendorId: 'gUsPilR0ZKPNyx0oRlUxCO45cfB3', slot: '11am' } };
  try {
    const result = await assignRiderTrips(req);
    console.log('Assignment result:', result);
  } catch (err) {
    console.error('Error assigning:', err);
  }
}
run().catch(console.error);
