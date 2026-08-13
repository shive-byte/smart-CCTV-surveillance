CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM (
    'admin',
    'operator',
    'worker'
);

CREATE TYPE maintenance_status AS ENUM (
    'PENDING',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
);

CREATE TYPE event_severity AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);

CREATE TYPE event_status AS ENUM (
    'DETECTED',
    'ACKNOWLEDGED',
    'RESOLVED'
);