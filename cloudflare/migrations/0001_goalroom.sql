CREATE TABLE sandboxes (
  id TEXT PRIMARY KEY,
  expires INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE INDEX sandboxes_expiry ON sandboxes(expires);
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  workspace TEXT NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  employee TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires);
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  employee TEXT NOT NULL,
  channel TEXT NOT NULL,
  action TEXT NOT NULL,
  status INTEGER NOT NULL,
  ms REAL NOT NULL,
  created TEXT NOT NULL
);
CREATE INDEX events_actor ON events(workspace,employee,id DESC);
CREATE TABLE rate_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX rate_limits_expiry ON rate_limits(expires);
