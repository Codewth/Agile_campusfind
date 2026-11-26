import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import AuthPage from './pages/Auth';
import Browse from './pages/Browse';
import ReportForm from './pages/ReportForm';
import MyReports from './pages/MyReports';
import ItemDetails from './pages/ItemDetails';
import Admin from './pages/Admin';
import { Dashboard, Notifications, CampusMap, Inventory, Assistant, Messages, SavedItems } from './pages/Platform';
import { Spinner } from './components/UI';
import { useAuth } from './context/AuthContext';
import { humanError, subscribeReports } from './lib/data';
function Protected({children}){
  const {user,loading}=useAuth(),location=useLocation();
  if(loading)return <Spinner text="Checking your session…"/>;
  return user?children:<Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace/>;
}
export default function App(){
  const {user}=useAuth();
  const [reports,setReports]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{
    setLoading(true);setReports([]);
    return subscribeReports(x=>{setReports(x);setError('');setLoading(false);},e=>{setError(humanError(e));setLoading(false);},{includeMine:!!user});
  },[user?.uid]);
  const publicReports=reports.filter(r=>r.moderationStatus!=='hidden');
  return <Layout><Routes>
    <Route path="/" element={<Home reports={publicReports} loading={loading}/>}/>
    <Route path="/login" element={<AuthPage mode="login"/>}/>
    <Route path="/register" element={<AuthPage mode="register"/>}/>
    <Route path="/browse" element={<Browse reports={publicReports} {...{loading,error}}/>}/>
    <Route path="/items/:id" element={<ItemDetails {...{reports,loading}}/>}/>
    <Route path="/admin" element={<Protected><Admin/></Protected>}/>
    <Route path="/dashboard" element={<Protected><Dashboard/></Protected>}/>
    <Route path="/notifications" element={<Protected><Notifications/></Protected>}/>
    <Route path="/map" element={<CampusMap/>}/>
    <Route path="/messages" element={<Protected><Messages/></Protected>}/>
    <Route path="/messages/:id" element={<Protected><Messages/></Protected>}/>
    <Route path="/assistant" element={<Assistant/>}/>
    <Route path="/inventory" element={<Protected><Inventory/></Protected>}/>
    <Route path="/saved" element={<Protected><SavedItems/></Protected>}/>
    <Route path="/my-reports" element={<Protected><MyReports {...{reports,loading,error}}/></Protected>}/>
    <Route path="/report/new" element={<Protected><ReportForm {...{reports,loading}}/></Protected>}/>
    <Route path="/report/:id/edit" element={<Protected><ReportForm {...{reports,loading}}/></Protected>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></Layout>;
}
