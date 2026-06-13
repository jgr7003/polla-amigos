const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const fs = require('fs');

const serviceAccountPath = "/Users/santiagobarrera/Downloads/polla-amigos-2026-sb-firebase-adminsdk-fbsvc-287270755b.json";
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const auth = getAuth();

async function restoreUsers() {
  try {
    console.log("Fetching users from Firebase Authentication...");
    const authUsersList = [];
    let pageToken;
    
    do {
      const listUsersResult = await auth.listUsers(1000, pageToken);
      listUsersResult.users.forEach((userRecord) => {
        authUsersList.push(userRecord.toJSON());
      });
      pageToken = listUsersResult.pageToken;
    } while (pageToken);

    console.log(`Found ${authUsersList.length} users in Firebase Authentication.`);

    // Read existing groups to map group admins back
    const groupsSnap = await db.collection("groups").get();
    const groupAdminsMap = {}; // userId -> array of groupIds
    
    groupsSnap.forEach(doc => {
      const group = doc.data();
      const groupId = doc.id;
      if (group.admins && Array.isArray(group.admins)) {
        group.admins.forEach(adminId => {
          if (!groupAdminsMap[adminId]) {
            groupAdminsMap[adminId] = [];
          }
          groupAdminsMap[adminId].push(groupId);
        });
      }
    });

    console.log("Restoring user profiles in Firestore...");
    let restoredCount = 0;

    for (const authUser of authUsersList) {
      const uid = authUser.uid;
      const email = authUser.email || "";
      const displayName = authUser.displayName || email.split('@')[0] || "Usuario";
      
      const userRef = db.collection("users").doc(uid);
      const docSnap = await userRef.get();
      
      const updateData = {
        uid: uid,
        email: email,
        displayName: displayName
      };

      // Set Superadmin back for Santiago
      if (email.toLowerCase() === "santiago.barrera20@gmail.com") {
        updateData.isAdmin = true;
      }

      // Restore groupIds for group admins
      if (groupAdminsMap[uid]) {
        updateData.groupIds = groupAdminsMap[uid];
      }

      // If document exists, merge. If not, create with 0 points
      if (docSnap.exists) {
        await userRef.update(updateData);
      } else {
        await userRef.set({
          ...updateData,
          points: 0
        });
      }

      console.log(`Restored user: ${displayName} (${email})`);
      restoredCount++;
    }

    console.log(`Successfully restored ${restoredCount} user profiles in Firestore!`);
    process.exit(0);
  } catch (err) {
    console.error("Failed to restore users:", err);
    process.exit(1);
  }
}

restoreUsers();
