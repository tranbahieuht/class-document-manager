import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(root, 'data')
const dbFile = path.join(dataDir, 'app.json')
const port = Number(process.env.API_PORT || 8787)
const sessionTtlMs = 8 * 60 * 60 * 1000
const allowedRoles = new Set(['super_admin', 'admin'])
const env = (name) => process.env[name]?.trim()
const supabaseAdmin = env('SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY')
  ? createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } })
  : null

fs.mkdirSync(dataDir, { recursive: true })
const readDb = () => {
  if (!fs.existsSync(dbFile)) return { profiles: [], sessions: [], activity_logs: [] }
  return JSON.parse(fs.readFileSync(dbFile, 'utf8'))
}
const writeDb = (db) => fs.writeFileSync(dbFile, JSON.stringify(db, null, 2))
const now = () => new Date().toISOString()
const id = () => crypto.randomUUID()
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (error, derived) => error ? reject(error) : resolve(`${salt}:${derived.toString('hex')}`)))
const verifyPassword = (password, stored) => new Promise((resolve, reject) => { const [salt, key] = String(stored).split(':'); crypto.scrypt(password, salt, 64, (error, derived) => error ? reject(error) : resolve(key && crypto.timingSafeEqual(Buffer.from(key, 'hex'), derived))) })
const json = (res, status, body, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }); res.end(JSON.stringify(body)) }
const parseBody = (req) => new Promise((resolve, reject) => { let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 1_000_000) req.destroy() }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch { reject(new Error('JSON không hợp lệ')) } }); req.on('error', reject) })
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => { const index = part.indexOf('='); return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))] }))
const safeProfile = ({ password_hash, ...profile }) => profile
const seedSuperAdmin = async (db) => {
  const existing = db.profiles.find(profile => profile.role === 'super_admin')
  if (existing) return db
  const email = env('SUPER_ADMIN_EMAIL')
  const password = env('SUPER_ADMIN_PASSWORD')
  const fullName = env('SUPER_ADMIN_NAME') || 'Chủ sở hữu hệ thống'
  if (!email || !password || password.length < 12) throw new Error('Thiếu SUPER_ADMIN_EMAIL hoặc SUPER_ADMIN_PASSWORD (tối thiểu 12 ký tự).')
  const profile = { id: id(), email: email.toLowerCase(), full_name: fullName, role: 'super_admin', is_active: true, password_hash: await hashPassword(password), created_at: now(), updated_at: now() }
  db.profiles.push(profile)
  db.activity_logs.push({ id: id(), actor_id: profile.id, action: 'seed_super_admin', target: profile.email, created_at: now() })
  writeDb(db)
  return db
}
const auth = async (req, res, db) => {
  const sessionId = cookies(req).session_id
  const session = db.sessions.find(item => item.id === sessionId && new Date(item.expires_at) > new Date())
  const profile = session && db.profiles.find(item => item.id === session.user_id && item.is_active)
  return profile || null
}
const requireRole = (profile, roles) => profile && roles.includes(profile.role)
const audit = (db, actor, action, target) => db.activity_logs.unshift({ id: id(), actor_id: actor.id, actor_name: actor.full_name, action, target, created_at: now() })
const route = (req) => new URL(req.url, `http://${req.headers.host || 'localhost'}`)
const bearer = (req) => req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null

const server = http.createServer(async (req, res) => {
  const url = route(req)
  if (!url.pathname.startsWith('/api/')) return json(res, 404, { error: 'API route không tồn tại.' })
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': 'http://localhost:5173', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end() }
  let db
  try { db = supabaseAdmin ? readDb() : await seedSuperAdmin(readDb()) } catch (error) { return json(res, 500, { error: error.message }) }
  try {
    if (req.method === 'POST' && url.pathname === '/api/admin/invite' && supabaseAdmin) {
      const token = bearer(req); if (!token) return json(res, 401, { error: 'Cần đăng nhập.' })
      const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token)
      if (authError || !authData.user) return json(res, 401, { error: 'Phiên đăng nhập không hợp lệ.' })
      const { data: owner, error: ownerError } = await supabaseAdmin.from('profiles').select('id,full_name,role,is_active').eq('id', authData.user.id).maybeSingle()
      if (ownerError || owner?.role !== 'super_admin' || !owner.is_active) return json(res, 403, { error: 'Chỉ super_admin được cấp tài khoản.' })
      const body = await parseBody(req); const email = String(body.email || '').trim().toLowerCase(); const fullName = String(body.full_name || '').trim()
      if (!email || !fullName) return json(res, 400, { error: 'Họ tên và email là bắt buộc.' })
      const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName, role: 'admin' } })
      if (inviteError) return json(res, 400, { error: inviteError.message })
      const { error: profileError } = await supabaseAdmin.from('profiles').upsert({ id: invited.user.id, email, full_name: fullName, role: 'admin', is_active: true })
      if (profileError) { await supabaseAdmin.auth.admin.deleteUser(invited.user.id); return json(res, 500, { error: 'Không thể tạo profile, invitation đã được rollback.' }) }
      await supabaseAdmin.from('activity_logs').insert({ user_id: owner.id, action: 'create_admin', entity_type: 'profile', entity_id: invited.user.id, description: `${owner.full_name} đã mời ${fullName}` })
      return json(res, 201, { user: { id: invited.user.id, email, full_name: fullName, role: 'admin', is_active: true } })
    }
    const profile = await auth(req, res, db)
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await parseBody(req); const user = db.profiles.find(item => item.email === String(body.email || '').trim().toLowerCase())
      if (!user || !user.is_active || !(await verifyPassword(String(body.password || ''), user.password_hash))) return json(res, 401, { error: 'Email hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.' })
      const session = { id: crypto.randomBytes(32).toString('hex'), user_id: user.id, expires_at: new Date(Date.now() + sessionTtlMs).toISOString() }
      db.sessions = db.sessions.filter(item => new Date(item.expires_at) > new Date()).concat(session); writeDb(db)
      return json(res, 200, { user: safeProfile(user) }, { 'Set-Cookie': `session_id=${encodeURIComponent(session.id)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionTtlMs / 1000}` })
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') { db.sessions = db.sessions.filter(item => item.id !== cookies(req).session_id); writeDb(db); return json(res, 200, { ok: true }, { 'Set-Cookie': 'session_id=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' }) }
    if (req.method === 'GET' && url.pathname === '/api/auth/me') return profile ? json(res, 200, { user: safeProfile(profile) }) : json(res, 401, { error: 'Chưa đăng nhập.' })
    if (url.pathname === '/api/admin/users' || url.pathname.startsWith('/api/admin/users/')) {
      if (!profile) return json(res, 401, { error: 'Cần đăng nhập.' })
      if (!requireRole(profile, ['super_admin'])) return json(res, 403, { error: 'Chỉ super_admin được phép quản lý tài khoản.' })
      if (url.pathname === '/api/admin/users' && req.method === 'GET') return json(res, 200, { users: db.profiles.map(safeProfile), activity_logs: db.activity_logs.slice(0, 50) })
      if (url.pathname === '/api/admin/users' && req.method === 'POST') {
        const body = await parseBody(req); const email = String(body.email || '').trim().toLowerCase(); const password = String(body.password || '')
        if (!email || !body.full_name || password.length < 12) return json(res, 400, { error: 'Họ tên, email và mật khẩu tối thiểu 12 ký tự là bắt buộc.' })
        if (body.role && body.role !== 'admin') return json(res, 400, { error: 'Chỉ được cấp role admin.' })
        if (db.profiles.some(item => item.email === email)) return json(res, 409, { error: 'Email đã tồn tại.' })
        const user = { id: id(), email, full_name: String(body.full_name).trim(), role: 'admin', is_active: true, password_hash: await hashPassword(password), created_at: now(), updated_at: now() }
        db.profiles.push(user); audit(db, profile, 'create_admin', user.email); writeDb(db); return json(res, 201, { user: safeProfile(user) })
      }
      if (url.pathname === '/api/admin/users') return json(res, 405, { error: 'Method không được hỗ trợ.' })
      const userId = url.pathname.split('/').pop(); const user = db.profiles.find(item => item.id === userId)
      if (!user) return json(res, 404, { error: 'Không tìm thấy tài khoản.' })
      if (user.role === 'super_admin') return json(res, 403, { error: 'Không thể thay đổi hoặc xóa super_admin.' })
      if (req.method === 'PATCH') { const body = await parseBody(req); if (body.role && body.role !== 'admin') return json(res, 400, { error: 'Role không hợp lệ.' }); if (body.password && body.password.length < 12) return json(res, 400, { error: 'Mật khẩu mới tối thiểu 12 ký tự.' }); const wasActive = user.is_active; user.full_name = body.full_name ? String(body.full_name).trim() : user.full_name; user.is_active = typeof body.is_active === 'boolean' ? body.is_active : user.is_active; if (body.password) user.password_hash = await hashPassword(body.password); user.updated_at = now(); audit(db, profile, body.password ? 'reset_admin_password' : (user.is_active === wasActive ? 'update_admin' : (user.is_active ? 'unlock_admin' : 'lock_admin')), user.email); writeDb(db); return json(res, 200, { user: safeProfile(user) }) }
      if (req.method === 'DELETE') { db.profiles = db.profiles.filter(item => item.id !== user.id); db.sessions = db.sessions.filter(item => item.user_id !== user.id); audit(db, profile, 'delete_admin', user.email); writeDb(db); return json(res, 200, { ok: true }) }
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/activity-logs') { if (!profile) return json(res, 401, { error: 'Cần đăng nhập.' }); if (!requireRole(profile, ['super_admin'])) return json(res, 403, { error: 'Forbidden' }); return json(res, 200, { activity_logs: db.activity_logs.slice(0, 100) }) }
    return json(res, 404, { error: 'API route không tồn tại.' })
  } catch (error) { console.error(error); return json(res, 500, { error: 'Lỗi máy chủ.' }) }
})

server.listen(port, () => console.log(`RBAC API listening on http://localhost:${port}`))
