ALTER TABLE cameras
ADD CONSTRAINT fk_camera_maintenance
FOREIGN KEY (maintenance_id)
REFERENCES maintenance_records(id)
ON DELETE SET NULL;