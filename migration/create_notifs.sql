CREATE TABLE web_notifications (
    id SERIAL PRIMARY KEY,

    event_id INTEGER,

    camera_id INTEGER NOT NULL,

    title VARCHAR(200) NOT NULL,

    message TEXT NOT NULL,

    severity event_severity NOT NULL,

    is_read BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_notification_event
        FOREIGN KEY (event_id)
        REFERENCES events(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_notification_camera
        FOREIGN KEY (camera_id)
        REFERENCES cameras(id)
        ON DELETE CASCADE
);