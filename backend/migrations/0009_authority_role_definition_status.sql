-- Authority role lifecycle.
ALTER TABLE role_definitions ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','suspended','retired'));
