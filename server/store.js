import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export function openStore(file){
  if(file!==':memory:')mkdirSync(dirname(file),{recursive:true});
  const db=new DatabaseSync(file);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  salt TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT NOT NULL, type TEXT NOT NULL,
  category TEXT NOT NULL, colour TEXT NOT NULL, location TEXT NOT NULL,
  incident_date TEXT NOT NULL, keywords TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  image_file TEXT NOT NULL DEFAULT '', image_mime TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS report_owner ON reports(owner_id);
CREATE INDEX IF NOT EXISTS report_status_type ON reports(status,type);
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(report_id,requester_id));
CREATE INDEX IF NOT EXISTS claim_report ON claims(report_id,status);
CREATE INDEX IF NOT EXISTS claim_requester ON claims(requester_id);
CREATE TABLE IF NOT EXISTS flags (
  id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL,
  UNIQUE(report_id,reporter_id));`);
  // Safe additive migrations for databases created by the first backend draft.
  const userColumns=db.prepare('PRAGMA table_info(users)').all().map(c=>c.name);
  if(!userColumns.includes('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
  const flagColumns=db.prepare('PRAGMA table_info(flags)').all().map(c=>c.name);
  if(!flagColumns.includes('status')) db.exec("ALTER TABLE flags ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
  const reportColumns=db.prepare('PRAGMA table_info(reports)').all().map(c=>c.name);
  if(!reportColumns.includes('moderation_status')) db.exec("ALTER TABLE reports ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'visible'");
  db.exec(`CREATE TABLE IF NOT EXISTS handover_checks (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    staff_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    identity_confirmed INTEGER NOT NULL CHECK(identity_confirmed=1),
    description_confirmed INTEGER NOT NULL CHECK(description_confirmed=1),
    signed_at TEXT NOT NULL,
    UNIQUE(report_id,claim_id)
  );`);
  return db;
}
export function publicReport(row){
  if(!row)return null;
  return {id:row.id,ownerId:row.owner_id,title:row.title,description:row.description,type:row.type,
    category:row.category,colour:row.colour,location:row.location,incidentDate:row.incident_date,
    keywords:row.keywords,status:row.status,moderationStatus:row.moderation_status,imageUrl:row.image_file?`/api/images/${row.image_file}`:'',
    createdAt:row.created_at,updatedAt:row.updated_at};
}
export function publicUser(row){return row?{uid:row.id,displayName:row.name,email:row.email,role:row.role}:null;}
