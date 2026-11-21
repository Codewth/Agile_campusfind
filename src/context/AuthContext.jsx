import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/data';
import { signInWithGoogle } from '../lib/firebase';
const Context=createContext(null);
export function AuthProvider({children}){
  const [user,setUser]=useState(null),[loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;api('/auth/me').then(({user})=>{if(active)setUser(user);}).catch(()=>{if(active)setUser(null);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  async function register(name,email,password){const result=await api('/auth/register',{method:'POST',body:{name,email,password}});setUser(result.user);return result;}
  async function login(email,password){const result=await api('/auth/login',{method:'POST',body:{email,password}});setUser(result.user);return result;}
  async function logout(){await api('/auth/logout',{method:'POST'});setUser(null);}
  async function googleLogin(){
    const idToken=await signInWithGoogle();
    const result=await api('/auth/firebase',{method:'POST',body:{idToken}});
    setUser(result.user);
    return result;
  }
  return <Context.Provider value={{user,loading,register,login,googleLogin,logout,configured:true}}>{children}</Context.Provider>;
}
export const useAuth=()=>useContext(Context);
