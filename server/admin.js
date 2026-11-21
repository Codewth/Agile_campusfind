import { openStore } from './store.js';
const [action,email]=process.argv.slice(2);
if(!['grant','revoke'].includes(action)||!email){console.error('Usage: node server/admin.js grant|revoke user@college.edu');process.exit(1);}
const db=openStore(process.env.DATABASE_PATH||'server/data/campusfind.sqlite');
const result=db.prepare('UPDATE users SET role=? WHERE email=?').run(action==='grant'?'admin':'member',email.trim().toLowerCase());
db.close();
if(!result.changes){console.error('Account not found. The person must register first.');process.exit(1);}
console.log(`Administrator access ${action==='grant'?'granted to':'revoked for'} ${email}`);
