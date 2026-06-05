const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

const hasFirebaseConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

export async function saveResult(result) {
  if (!hasFirebaseConfig) return;

  const appModule = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js");
  const firestoreModule = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js");
  const app = appModule.initializeApp(firebaseConfig);
  const db = firestoreModule.getFirestore(app);

  await firestoreModule.addDoc(firestoreModule.collection(db, "mazeResults"), {
    ...result,
    createdAt: firestoreModule.serverTimestamp()
  });
}
