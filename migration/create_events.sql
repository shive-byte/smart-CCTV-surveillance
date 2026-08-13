CREATE TABLE events (
    id SERIAL PRIMARY KEY,

    camera_id INTEGER NOT NULL,

    event_type VARCHAR(50) NOT NULL,

    severity event_severity NOT NULL,

    event_status event_status NOT NULL DEFAULT 'DETECTED',

    temperature REAL,

    humidity REAL,

    voltage REAL,

    dust REAL,

    vibration REAL,

    light REAL,

    prediction VARCHAR(100),

    image_path TEXT,

    description TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_events_camera
        FOREIGN KEY (camera_id)
        REFERENCES cameras(id)
        ON DELETE CASCADE
);