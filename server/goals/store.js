import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new AppError(status, message); };
const hash = value => createHash('sha256').update(value).digest('hex');
const passwordHash = (password, salt) => scryptSync(password, salt, 32).toString('hex');
const dateOffset = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

export function createStore(filename) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS employees(workspace TEXT, id TEXT, name TEXT, email TEXT, department TEXT,
      role TEXT, manager TEXT, salt TEXT, password TEXT, PRIMARY KEY(workspace,id));
    CREATE TABLE IF NOT EXISTS goals(workspace TEXT, id TEXT, employee TEXT, title TEXT, target TEXT,
      due TEXT, progress INTEGER, version INTEGER, PRIMARY KEY(workspace,id));
    CREATE TABLE IF NOT EXISTS notes(workspace TEXT, id TEXT PRIMARY KEY, goal TEXT, author TEXT, kind TEXT, text TEXT, created TEXT);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, workspace TEXT, employee TEXT, expires INTEGER);
    CREATE TABLE IF NOT EXISTS replays(workspace TEXT, employee TEXT, key TEXT, fingerprint TEXT, result TEXT,
      PRIMARY KEY(workspace,employee,key));
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, workspace TEXT, employee TEXT, channel TEXT,
      action TEXT, status INTEGER, ms REAL, created TEXT);`);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const clean = () => {
    for (const w of all('SELECT id FROM workspaces WHERE expires < ?', Date.now())) {
      for (const table of ['employees','goals','notes','sessions','replays','events']) run(`DELETE FROM ${table} WHERE workspace=?`, w.id);
      run('DELETE FROM workspaces WHERE id=?', w.id);
    }
  };
  const employees = actor => all('SELECT id,name,email,department,role,manager FROM employees WHERE workspace=? ORDER BY name', actor.workspace);
  const within = (actor, id) => {
    if (actor.role === 'admin' || actor.id === id) return true;
    const people = employees(actor);
    let person = people.find(p => p.id === id);
    if (actor.role === 'supervisor') return person?.manager === actor.id;
    if (actor.role !== 'head') return false;
    const seen = new Set();
    while (person?.manager && !seen.has(person.id)) {
      seen.add(person.id);
      if (person.manager === actor.id) return true;
      person = people.find(p => p.id === person.manager);
    }
    return false;
  };
  const canManage = (actor, id) => actor.role === 'admin' || (actor.id !== id && within(actor, id) && ['head','supervisor'].includes(actor.role));
  const employee = (actor, id) => {
    const person = employees(actor).find(p => p.id === id);
    if (!person || !within(actor, id)) fail(404, 'Employee not found in your scope.');
    return person;
  };
  const goal = (actor, id) => {
    const row = get('SELECT id,employee,title,target,due,progress,version FROM goals WHERE workspace=? AND id=?', actor.workspace, id);
    if (!row || !within(actor, row.employee)) fail(404, 'Goal not found in your scope.');
    return { ...row, status: row.progress === 100 ? 'complete' : row.due < dateOffset(0) ? 'overdue' : 'in_progress',
      canUpdate: row.employee === actor.id, canManage: canManage(actor, row.employee),
      notes: all('SELECT id,author,kind,text,created FROM notes WHERE workspace=? AND goal=? ORDER BY created,id', actor.workspace, id) };
  };
  return {
    db, within, canManage, employee, goal,
    createWorkspace() {
      clean();
      if (get('SELECT COUNT(*) AS count FROM workspaces').count >= 100) fail(429, 'Sandbox capacity reached. Try again later.');
      const workspace = randomUUID();
      const expires = Date.now() + 86400000;
      const fixtures = [
        ['admin','Jordan Blake','Operations','admin',null],
        ['maya','Maya Patel','Engineering','head',null],
        ['evan','Evan Brooks','Engineering','supervisor','maya'],
        ['alex-r','Alex Rivera','Engineering','employee','evan'],
        ['priya','Priya Shah','Engineering','employee','evan'],
        ['noah','Noah Williams','Customer Success','head',null],
        ['lena','Lena Ortiz','Customer Success','supervisor','noah'],
        ['alex-c','Alex Chen','Customer Success','employee','lena'],
        ['sam','Sam Taylor','Customer Success','employee','lena']
      ];
      const accounts = [];
      db.exec('BEGIN IMMEDIATE');
      try {
        run('INSERT INTO workspaces VALUES(?,?)', workspace, expires);
        for (const [id,name,department,role,manager] of fixtures) {
          const password = randomBytes(12).toString('base64url');
          const salt = randomBytes(16).toString('hex');
          const email = `${id}@example.test`;
          run('INSERT INTO employees VALUES(?,?,?,?,?,?,?,?,?)', workspace,id,name,email,department,role,manager,salt,passwordHash(password,salt));
          accounts.push({ id,name,email,role,password });
          if (role !== 'admin') {
            const titles = department === 'Engineering' ? ['Improve release reliability','Complete security training'] : ['Improve customer onboarding','Publish account playbook'];
            titles.forEach((title,i) => run('INSERT INTO goals VALUES(?,?,?,?,?,?,?,?)',workspace,`${id}-${i+1}`,id,title,i ? 'Complete all 4 modules' : 'Deliver 3 documented improvements',dateOffset(i ? 14 : -3),i ? 25 : 60,1));
          }
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return { workspace, expires, accounts };
    },
    login(workspace, email, password) {
      clean();
      if (typeof password !== 'string' || password.length > 200) fail(401, 'Invalid credentials.');
      const p = get('SELECT * FROM employees WHERE workspace=? AND email=?', workspace, email);
      const derived = passwordHash(password, p?.salt || 'invalid-credentials');
      if (!p || !timingSafeEqual(Buffer.from(derived,'hex'), Buffer.from(p.password,'hex'))) fail(401, 'Invalid credentials.');
      const token = randomBytes(32).toString('base64url');
      const expires = Math.min(Date.now()+3600000, get('SELECT expires FROM workspaces WHERE id=?', workspace).expires);
      run('INSERT INTO sessions VALUES(?,?,?,?)', hash(token),workspace,p.id,expires);
      return { token, expires };
    },
    authenticate(token) {
      const p = get(`SELECT e.* FROM sessions s JOIN employees e ON e.workspace=s.workspace AND e.id=s.employee
        JOIN workspaces w ON w.id=s.workspace WHERE s.token=? AND s.expires>? AND w.expires>?`,hash(token),Date.now(),Date.now());
      if (!p) fail(401,'Sign in to your sandbox.');
      const { password, salt, ...actor } = p;
      return actor;
    },
    logout(token) { run('DELETE FROM sessions WHERE token=?', hash(token)); },
    listEmployees(actor) { return employees(actor).filter(p => within(actor,p.id)).map(p => ({...p,canManage:canManage(actor,p.id)})); },
    listGoals(actor, filters={}) {
      if (filters.employee) employee(actor, filters.employee);
      return all('SELECT id,employee,title FROM goals WHERE workspace=? ORDER BY due,id',actor.workspace)
        .filter(g => within(actor,g.employee) && (!filters.employee || filters.employee===g.employee) && (!filters.query || g.title.toLowerCase().includes(filters.query.toLowerCase())))
        .map(g=>goal(actor,g.id)).filter(g=>!filters.status || g.status===filters.status);
    },
    createGoal(actor, input) {
      employee(actor,input.employee);
      if (!canManage(actor,input.employee)) fail(403,'Only an authorized supervisor can assign goals.');
      if (get('SELECT COUNT(*) AS count FROM goals WHERE workspace=?',actor.workspace).count >= 1000) fail(429,'Sandbox goal limit reached.');
      const id = randomUUID();
      run('INSERT INTO goals VALUES(?,?,?,?,?,?,?,?)',actor.workspace,id,input.employee,input.title,input.target,input.due,0,1);
      return goal(actor,id);
    },
    updateProgress(actor, input) {
      const g = goal(actor,input.id);
      if (g.employee !== actor.id) fail(403,'Only the employee can update their progress.');
      if (g.version !== input.version) fail(409,'This goal changed. Read it again before updating.');
      if (get('SELECT COUNT(*) AS count FROM notes WHERE workspace=?',actor.workspace).count >= 5000) fail(429,'Sandbox note limit reached.');
      run('UPDATE goals SET progress=?,version=version+1 WHERE workspace=? AND id=?',input.progress,actor.workspace,g.id);
      run('INSERT INTO notes VALUES(?,?,?,?,?,?,?)',actor.workspace,randomUUID(),g.id,actor.id,'progress',input.note,new Date().toISOString());
      return goal(actor,g.id);
    },
    addFeedback(actor,input) {
      const g = goal(actor,input.id);
      if (!canManage(actor,g.employee)) fail(403,'Only an authorized supervisor can add feedback.');
      if (g.version !== input.version) fail(409,'This goal changed. Read it again before updating.');
      if (get('SELECT COUNT(*) AS count FROM notes WHERE workspace=?',actor.workspace).count >= 5000) fail(429,'Sandbox note limit reached.');
      run('INSERT INTO notes VALUES(?,?,?,?,?,?,?)',actor.workspace,randomUUID(),g.id,actor.id,'feedback',input.note,new Date().toISOString());
      run('UPDATE goals SET version=version+1 WHERE workspace=? AND id=?',actor.workspace,g.id);
      return goal(actor,g.id);
    },
    setManager(actor,input) {
      if (actor.role !== 'admin') fail(403,'Administrator access required.');
      const p = employee(actor,input.employee);
      if (p.role === 'admin') fail(400,'Administrator has no reporting relationship.');
      const manager = input.manager ? employee(actor,input.manager) : null;
      if (manager && (!['head','supervisor'].includes(manager.role) || manager.department !== p.department)) fail(400,'Choose a supervisor in the same department.');
      const people = employees(actor);
      let cursor = manager;
      const seen = new Set([p.id]);
      while(cursor) {
        if (seen.has(cursor.id)) fail(400,'Reporting relationships cannot form a cycle.');
        seen.add(cursor.id); cursor=people.find(x=>x.id===cursor.manager);
      }
      run('UPDATE employees SET manager=? WHERE workspace=? AND id=?',input.manager || null,actor.workspace,p.id);
      return employee(actor,p.id);
    },
    mutate(actor,key,action,input,fn) {
      if (typeof key !== 'string' || key.length<8 || key.length>128) fail(400,'Supply an Idempotency-Key of 8 to 128 characters.');
      const fingerprint = hash(JSON.stringify([action,input]));
      db.exec('BEGIN IMMEDIATE');
      try {
        const prior=get('SELECT * FROM replays WHERE workspace=? AND employee=? AND key=?',actor.workspace,actor.id,key);
        if (prior) {
          if (prior.fingerprint !== fingerprint) fail(409,'Idempotency key already used for a different request.');
          db.exec('COMMIT'); return JSON.parse(prior.result);
        }
        const result=fn();
        run('INSERT INTO replays VALUES(?,?,?,?,?)',actor.workspace,actor.id,key,fingerprint,JSON.stringify(result));
        db.exec('COMMIT'); return result;
      } catch(e) { db.exec('ROLLBACK'); throw e; }
    },
    record(actor, channel, action, status, ms) {
      run('INSERT INTO events(workspace,employee,channel,action,status,ms,created) VALUES(?,?,?,?,?,?,?)',actor.workspace,actor.id,channel,action,status,ms,new Date().toISOString());
      run('DELETE FROM events WHERE workspace=? AND id NOT IN (SELECT id FROM events WHERE workspace=? ORDER BY id DESC LIMIT 2000)',actor.workspace,actor.workspace);
    },
    events(actor) { return all('SELECT channel,action,status,ms,created FROM events WHERE workspace=? AND employee=? ORDER BY id DESC LIMIT 100',actor.workspace,actor.id); },
    close() { db.close(); }
  };
}

