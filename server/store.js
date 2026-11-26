import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export function openStore(file){
  if(file!==':memory:')mkdirSync(dirname(file),{recursive:true});
  const db=new DatabaseSync(file);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  salt TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', created_at TEXT NOT NULL,
  about_me TEXT NOT NULL DEFAULT '', department TEXT NOT NULL DEFAULT '',
  year_of_study TEXT NOT NULL DEFAULT '', profile_updated_at TEXT NOT NULL DEFAULT '');
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
  db.exec(`
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '', read_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS notification_user ON notifications(user_id,read_at,created_at);
CREATE TABLE IF NOT EXISTS saved_reports (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, PRIMARY KEY(user_id,report_id));
CREATE TABLE IF NOT EXISTS saved_searches (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, query TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS saved_search_user ON saved_searches(user_id);
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL,
  colour TEXT NOT NULL DEFAULT '', identifying_code TEXT NOT NULL DEFAULT '',
  image_file TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS inventory_user ON inventory(user_id);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, report_id TEXT REFERENCES reports(id) ON DELETE SET NULL,
  user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(report_id,user_a,user_b));
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS message_conversation ON messages(conversation_id,created_at);
CREATE TABLE IF NOT EXISTS blocked_users (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, PRIMARY KEY(blocker_id,blocked_id));
CREATE TABLE IF NOT EXISTS report_events (
  id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS report_event_report ON report_events(report_id,created_at);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY, actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '', ip_address TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS audit_log_created ON audit_log(created_at);
CREATE TABLE IF NOT EXISTS recovery_stories (
  id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  story TEXT NOT NULL, consent INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  match_notifications INTEGER NOT NULL DEFAULT 1,
  message_notifications INTEGER NOT NULL DEFAULT 1,
  privacy_leaderboard INTEGER NOT NULL DEFAULT 1,
  theme TEXT NOT NULL DEFAULT 'system',
  updated_at TEXT NOT NULL);`);
  // Safe additive migrations for databases created by the first backend draft.
  const userColumns=db.prepare('PRAGMA table_info(users)').all().map(c=>c.name);
  if(!userColumns.includes('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
  if(!userColumns.includes('about_me')) db.exec("ALTER TABLE users ADD COLUMN about_me TEXT NOT NULL DEFAULT ''");
  if(!userColumns.includes('department')) db.exec("ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT ''");
  if(!userColumns.includes('year_of_study')) db.exec("ALTER TABLE users ADD COLUMN year_of_study TEXT NOT NULL DEFAULT ''");
  if(!userColumns.includes('profile_updated_at')) db.exec("ALTER TABLE users ADD COLUMN profile_updated_at TEXT NOT NULL DEFAULT ''");
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
  if(!reportColumns.includes('campus_zone')) db.exec("ALTER TABLE reports ADD COLUMN campus_zone TEXT NOT NULL DEFAULT ''");
  if(!reportColumns.includes('latitude')) db.exec("ALTER TABLE reports ADD COLUMN latitude REAL");
  if(!reportColumns.includes('longitude')) db.exec("ALTER TABLE reports ADD COLUMN longitude REAL");
  if(!reportColumns.includes('item_number')) db.exec("ALTER TABLE reports ADD COLUMN item_number TEXT");
  if(!reportColumns.includes('expires_at')) db.exec("ALTER TABLE reports ADD COLUMN expires_at TEXT");
  if(!reportColumns.includes('renewed_at')) db.exec("ALTER TABLE reports ADD COLUMN renewed_at TEXT");
  db.exec("UPDATE reports SET item_number = 'CF-' || substr(id,1,8) WHERE item_number IS NULL OR item_number=''");
  db.exec("UPDATE reports SET expires_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at, '+45 days') WHERE expires_at IS NULL");
  return db;
}
export function publicReport(row){
  if(!row)return null;
  return {id:row.id,ownerId:row.owner_id,title:row.title,description:row.description,type:row.type,
    category:row.category,colour:row.colour,location:row.location,incidentDate:row.incident_date,
    keywords:row.keywords,status:row.status,moderationStatus:row.moderation_status,imageUrl:row.image_file?`/api/images/${row.image_file}`:'',
    campusZone:row.campus_zone||'',latitude:row.latitude??null,longitude:row.longitude??null,
    itemNumber:row.item_number||'',expiresAt:row.expires_at||'',renewedAt:row.renewed_at||'',
    createdAt:row.created_at,updatedAt:row.updated_at};
}
export function publicUser(row){return row?{uid:row.id,displayName:row.name,email:row.email,role:row.role}:null;}
