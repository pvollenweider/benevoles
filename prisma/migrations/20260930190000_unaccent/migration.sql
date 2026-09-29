-- Accent-insensitive admin search (#390): « zoe » finds « Zoé ». Postgres contrib extension,
-- shipped with the official images used in CI and in production.
CREATE EXTENSION IF NOT EXISTS unaccent;
