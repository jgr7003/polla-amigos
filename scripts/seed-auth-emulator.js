/**
 * Seeds Firebase Auth Emulator users from Firestore `users` collection.
 * All accounts get the same password (default: colombia1/).
 *
 * Usage (emulators must be running):
 *   FIRESTORE_EMULATOR_HOST=localhost:8082 \
 *   FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
 *   node scripts/seed-auth-emulator.js
 *
 * Optional:
 *   SEED_AUTH_PASSWORD=colombia1/
 */

const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const PROJECT_ID = "polla-amigos-2026-sb";
const DEFAULT_PASSWORD = process.env.SEED_AUTH_PASSWORD || "colombia1/";

function ensureApp() {
  if (getApps().length === 0) {
    initializeApp({ projectId: PROJECT_ID });
  }
}

async function clearAuthUsers(auth) {
  let pageToken;
  let deleted = 0;

  do {
    const result = await auth.listUsers(1000, pageToken);
    await Promise.all(result.users.map((user) => auth.deleteUser(user.uid)));
    deleted += result.users.length;
    pageToken = result.pageToken;
  } while (pageToken);

  return deleted;
}

async function seedAuthFromFirestore() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("FIRESTORE_EMULATOR_HOST is required (e.g. localhost:8082)");
    process.exit(1);
  }
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.error("FIREBASE_AUTH_EMULATOR_HOST is required (e.g. localhost:9099)");
    process.exit(1);
  }

  ensureApp();
  const db = getFirestore();
  const auth = getAuth();

  const usersSnap = await db.collection("users").get();
  if (usersSnap.empty) {
    console.error("No users found in Firestore emulator.");
    process.exit(1);
  }

  const cleared = await clearAuthUsers(auth);
  if (cleared > 0) {
    console.log(`Cleared ${cleared} existing Auth emulator account(s).`);
  }

  let created = 0;
  let failed = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const uid = doc.id;
    const email = data.email;

    if (!email) {
      console.warn(`Skipping ${uid}: missing email`);
      failed++;
      continue;
    }

    try {
      await auth.createUser({
        uid,
        email,
        password: DEFAULT_PASSWORD,
        displayName: data.displayName || email.split("@")[0],
        emailVerified: false,
      });
      console.log(`Created: ${email} (${uid})`);
      created++;
    } catch (err) {
      console.error(`Failed ${email} (${uid}):`, err.message || err);
      failed++;
    }
  }

  console.log(`\nDone. Created ${created} user(s), ${failed} failed.`);
  console.log(`Password for all accounts: ${DEFAULT_PASSWORD}`);
  console.log(
    "\nPersist to emulator-data (Firestore + Auth):\n" +
      "  firebase emulators:export ./emulator-data --force"
  );

  process.exit(failed > 0 ? 1 : 0);
}

seedAuthFromFirestore().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
