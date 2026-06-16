-- Cria banco separado para Evolution API
SELECT 'CREATE DATABASE evolution'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evolution')\gexec
