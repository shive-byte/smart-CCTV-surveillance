CREATE TABLE maintenance_records (
    id SERIAL PRIMARY KEY,

    camera_id INTEGER NOT NULL,

    event_id INTEGER,

    maintenance_type VARCHAR(100) NOT NULL,

    recommendation TEXT,

    status maintenance_status NOT NULL DEFAULT 'PENDING',

    performed_by VARCHAR(10),

    maintenance_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    next_maintenance TIMESTAMP,

    remarks TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_maintenance_camera
        FOREIGN KEY (camera_id)
        REFERENCES cameras(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_maintenance_event
        FOREIGN KEY (event_id)
        REFERENCES events(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_maintenance_user
        FOREIGN KEY (performed_by)
        REFERENCES users(id)
        ON DELETE SET NULL
);