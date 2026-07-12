const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  const tripId = 'euchI41hf3vEANchST3n';
  await db.collection('rider_trips').doc(tripId).update({
    status: 'dropping',
    dropStops: [
      {
        orderId: 'MdQj8C2AB4QxzZ6CRAlp',
        customerId: 'CwEgiPBamcdEgMcCBdJ0frxumbu2',
        location: { lat: 21.146318111995427, lng: 79.14702209398887 },
        address: 'Karambhoomi',
        landmark: '',
        sequence: 1,
        distanceKm: 2.6957032498739952,
        status: 'pending'
      },
      {
        orderId: 'S3Y7c7dfDkAEkaufOCIA',
        customerId: 'eP7P86u1LaS2y2OZWXWhU5IZNiy1',
        location: { lat: 18.5204, lng: 73.8567 },
        address: "Rushi's Location",
        landmark: '',
        sequence: 2,
        distanceKm: 625.594981928334,
        status: 'pending'
      }
    ],
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log('Fixed dropStops');
}
run().catch(console.error);
