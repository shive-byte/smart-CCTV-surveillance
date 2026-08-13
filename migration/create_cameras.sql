CREATE TABLE cameras (
    id SERIAL PRIMARY KEY,

    device_id VARCHAR(100) UNIQUE NOT NULL,

    location VARCHAR(255) NOT NULL,

    ip_address INET,

    status VARCHAR(30) NOT NULL DEFAULT 'offline',

    health_score NUMERIC(5,2) DEFAULT 100.00,

    operator_id VARCHAR(10) NOT NULL,

    maintenance_id INTEGER,

    maintenance_status maintenance_status NOT NULL DEFAULT 'COMPLETED',

    maintenance_date TIMESTAMP,

    last_seen TIMESTAMP,

    installed_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_camera_operator
        FOREIGN KEY (operator_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
);