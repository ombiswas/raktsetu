-- Initialize database extensions for RaktSetu
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'RaktSetu database extensions initialized successfully.';
END $$;
