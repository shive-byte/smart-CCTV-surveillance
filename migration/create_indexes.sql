CREATE INDEX idx_cameras_maintenance_id
ON cameras(maintenance_id);

CREATE INDEX idx_cameras_operator_id
ON cameras(operator_id);

CREATE INDEX idx_cameras_last_seen
ON cameras(last_seen);

CREATE INDEX idx_events_camera_created
ON events(camera_id, created_at DESC);

CREATE INDEX idx_events_type
ON events(event_type);

CREATE INDEX idx_events_unresolved
ON events(camera_id, created_at DESC)
WHERE event_status <> 'RESOLVED';

CREATE INDEX idx_maintenance_camera
ON maintenance_records(camera_id);

CREATE INDEX idx_maintenance_event_id
ON maintenance_records(event_id);

CREATE INDEX idx_maintenance_pending
ON maintenance_records(camera_id, maintenance_date)
WHERE status IN ('PENDING', 'IN_PROGRESS');

CREATE INDEX idx_web_notifications_created_at
ON web_notifications(created_at DESC);

CREATE INDEX idx_web_notifications_unread
ON web_notifications(is_read)
WHERE is_read = FALSE;

CREATE INDEX idx_audit_logs_created_at
ON audit_logs(created_at DESC);

CREATE INDEX idx_audit_logs_user_id
ON audit_logs(user_id);

CREATE INDEX idx_audit_logs_entity
ON audit_logs(entity_type, entity_id);

CREATE UNIQUE INDEX idx_one_active_maintenance_per_camera
ON maintenance_records(camera_id)
WHERE status IN ('PENDING', 'IN_PROGRESS');