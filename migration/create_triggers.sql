CREATE OR REPLACE FUNCTION generate_user_id()
RETURNS TRIGGER
AS $$
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        NEW.id := 'TN' ||
                  LPAD(
                      nextval('user_id_seq')::TEXT,
                      3,
                      '0'
                  );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_id_trigger
BEFORE INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION generate_user_id();

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at_trigger
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER cameras_updated_at_trigger
BEFORE UPDATE ON cameras
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER events_updated_at_trigger
BEFORE UPDATE ON events
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER maintenance_updated_at_trigger
BEFORE UPDATE ON maintenance_records
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_maintenance_date()
RETURNS TRIGGER
AS $$
BEGIN

    -- New maintenance request
    IF TG_OP = 'INSERT' THEN

        NEW.maintenance_date := CURRENT_TIMESTAMP;

    -- Maintenance completed
    ELSIF TG_OP = 'UPDATE'
          AND NEW.status = 'COMPLETED'
          AND OLD.status <> 'COMPLETED' THEN

        NEW.maintenance_date := CURRENT_TIMESTAMP;

    END IF;

    RETURN NEW;

END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER maintenance_date_trigger
BEFORE INSERT OR UPDATE OF status
ON maintenance_records
FOR EACH ROW
EXECUTE FUNCTION set_maintenance_date();

CREATE OR REPLACE FUNCTION sync_camera_maintenance()
RETURNS TRIGGER
AS $$
BEGIN

    UPDATE cameras
    SET
        maintenance_id = NEW.id,
        maintenance_status = NEW.status,
        maintenance_date = NEW.maintenance_date
    WHERE id = NEW.camera_id;

    RETURN NEW;

END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER camera_maintenance_sync_trigger
AFTER INSERT OR UPDATE
ON maintenance_records
FOR EACH ROW
EXECUTE FUNCTION sync_camera_maintenance();