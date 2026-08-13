CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,

    user_id VARCHAR(10),

    action VARCHAR(100) NOT NULL,

    entity_type VARCHAR(50),

    entity_id INTEGER,

    details JSONB,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_audit_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);