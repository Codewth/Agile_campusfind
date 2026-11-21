import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const config={
  apiKey:import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};
export const firebaseConfigured=Boolean(config.apiKey&&config.authDomain&&config.projectId&&config.appId);
const app=firebaseConfigured?initializeApp(config):null;
const auth=app?getAuth(app):null;

export async function signInWithGoogle(){
  if(!auth)throw new Error('Google sign-in is not configured.');
  const provider=new GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  try{
    const result=await signInWithPopup(auth,provider);
    return result.user.getIdToken();
  }catch(error){
    if(error?.code==='auth/configuration-not-found'){
      throw new Error('Firebase Authentication is not configured for this project. Enable Google in Firebase Console under Authentication > Sign-in method.');
    }
    if(error?.code==='auth/unauthorized-domain'){
      throw new Error('This local address is not authorized. Add localhost in Firebase Console under Authentication > Settings > Authorized domains.');
    }
    if(error?.code==='auth/popup-closed-by-user')throw new Error('Google sign-in was cancelled.');
    throw error;
  }
}
