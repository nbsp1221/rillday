CREATE UNIQUE INDEX IF NOT EXISTS initial_admin_once ON user (role)
WHERE
  role = 'admin';

CREATE TRIGGER IF NOT EXISTS account_capacity
BEFORE INSERT ON user
WHEN (SELECT count(*) FROM user) >= 10
BEGIN
  SELECT RAISE(ABORT, 'account_capacity');
END;
