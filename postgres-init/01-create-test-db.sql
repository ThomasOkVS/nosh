-- Runs once, on first container init (docker-entrypoint-initdb.d convention).
-- Nosh's dev/test Postgres holds two databases on the same server: the main
-- dev DB (POSTGRES_DB) and this one, used only by the backend's test suite so
-- running tests never touches real recipe data.
CREATE DATABASE nosh_test;
