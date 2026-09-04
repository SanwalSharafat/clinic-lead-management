-- ============================================================================
-- 001_initial_schema.sql
--
-- Single-tenant Clinic Lead Management System
--
-- This schema supports one clinic instance. All tables use UUID primary keys
-- and TIMESTAMPTZ timestamps. Status-like columns use TEXT with CHECK
-- constraints (not ENUMs) so values remain human-readable in the Supabase
-- table editor. A cleanup function is provided for stale pending_bookings.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. clinic_config
--    Stores a single, versioned row of clinic-level configuration including
--    required lead fields, field definitions, scoring rules, and thresholds.
-- ----------------------------------------------------------------------------
CREATE TABLE clinic_config (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    version         INTEGER     NOT NULL DEFAULT 1,
    required_fields JSONB       NOT NULL DEFAULT '[]'::jsonb,
    field_definitions JSONB     NOT NULL DEFAULT '{}'::jsonb,
    scoring_rules   JSONB       NOT NULL DEFAULT '[]'::jsonb,
    thresholds      JSONB       NOT NULL DEFAULT '{"high": 60, "medium": 30}'::jsonb,
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE clinic_config IS
    'Single-row, versioned configuration for the clinic instance.';

-- ----------------------------------------------------------------------------
-- 2. patients
--    Central table for all leads / patients. Tracks scoring, status,
--    assignment, and opt-out state.
-- ----------------------------------------------------------------------------
CREATE TABLE patients (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT,
    phone             TEXT        NOT NULL,
    email             TEXT,
    source            TEXT        NOT NULL CHECK (source IN ('whatsapp', 'web_form')),
    raw_message       TEXT,
    extracted_fields  JSONB       NOT NULL DEFAULT '{}'::jsonb,
    lead_score        INTEGER,
    score_tier        TEXT        CHECK (score_tier IN ('HIGH', 'MEDIUM', 'LOW')),
    status            TEXT        NOT NULL DEFAULT 'NEW_LEAD'
        CHECK (status IN (
            'NEW_LEAD', 'INCOMPLETE', 'HUMAN_REVIEW', 'NURTURING',
            'QUALIFIED', 'BOOKED_VISIT', 'WON', 'LOST', 'OPTED_OUT'
        )),
    attempt_count     INTEGER     NOT NULL DEFAULT 0,
    config_version    INTEGER,
    assigned_staff_id UUID,
    opted_out         BOOLEAN     NOT NULL DEFAULT false,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT patients_phone_unique UNIQUE (phone)
);

COMMENT ON TABLE patients IS
    'All clinic leads and patients with scoring, status lifecycle, and assignment.';

CREATE INDEX idx_patients_status      ON patients (status);
CREATE INDEX idx_patients_phone       ON patients (phone);
CREATE INDEX idx_patients_score_tier  ON patients (score_tier);
CREATE INDEX idx_patients_created_at  ON patients (created_at);

-- ----------------------------------------------------------------------------
-- 3. interactions
--    Every inbound or outbound message exchanged with a patient, regardless
--    of channel.  external_message_id is the provider-side message id (e.g.
--    Twilio SID) used for deduplication.
-- ----------------------------------------------------------------------------
CREATE TABLE interactions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    channel             TEXT        NOT NULL CHECK (channel IN ('whatsapp', 'web_form')),
    message             TEXT        NOT NULL,
    direction           TEXT        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    external_message_id TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE interactions IS
    'Message log for all patient communications across channels.';

-- Partial unique index: only enforce uniqueness when external_message_id is set.
-- NULL values are excluded automatically by the WHERE clause.
CREATE UNIQUE INDEX idx_interactions_external_message_id
    ON interactions (external_message_id)
    WHERE external_message_id IS NOT NULL;

CREATE INDEX idx_interactions_patient_id  ON interactions (patient_id);
CREATE INDEX idx_interactions_created_at  ON interactions (created_at);

-- ----------------------------------------------------------------------------
-- 4. appointments
--    Scheduled patient visits.  calendar_event_id links to the external
--    calendar (Google Calendar event id, etc.).
-- ----------------------------------------------------------------------------
CREATE TABLE appointments (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id        UUID        NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    calendar_event_id TEXT,
    scheduled_time    TIMESTAMPTZ NOT NULL,
    status            TEXT        NOT NULL DEFAULT 'SCHEDULED'
        CHECK (status IN ('SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE appointments IS
    'Patient appointment slots with lifecycle status.';

CREATE INDEX idx_appointments_patient_id     ON appointments (patient_id);
CREATE INDEX idx_appointments_scheduled_time ON appointments (scheduled_time);

-- ----------------------------------------------------------------------------
-- 5. pending_bookings
--    Temporary lock rows created while a calendar booking is in progress.
--    They expire after a short window so that concurrent booking attempts for
--    the same slot do not permanently block each other.
--
--    NOTE: The unique index on (calendar_id, requested_slot) is a regular
--    (non-partial) unique index.  Expired rows are NOT automatically excluded
--    from the uniqueness check by the index itself.  Instead, the application
--    (or a scheduled job) MUST call clean_expired_pending_bookings() BEFORE
--    attempting a new insert for the same slot.  This avoids the complexity
--    of a partial unique index on an expression (expires_at >= now()), which
--    is both harder to maintain and can behave unexpectedly with clock skew.
-- ----------------------------------------------------------------------------
CREATE TABLE pending_bookings (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    requested_slot  TIMESTAMPTZ NOT NULL,
    calendar_id     TEXT        NOT NULL,
    patient_id      UUID        NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pending_bookings_slot_unique UNIQUE (calendar_id, requested_slot)
);

COMMENT ON TABLE pending_bookings IS
    'Short-lived booking locks.  Call clean_expired_pending_bookings() before inserting.';

CREATE INDEX idx_pending_bookings_expires_at ON pending_bookings (expires_at);

-- ----------------------------------------------------------------------------
-- 6. human_reviews
--    Queue of items that require human attention — flagged by the AI or
--    requested by the patient.  Each row is resolved when a staff member
--    makes a decision.
-- ----------------------------------------------------------------------------
CREATE TABLE human_reviews (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID        NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    reason          TEXT        NOT NULL
        CHECK (reason IN (
            'HIGH_SCORE', 'MEDIUM_SCORE', 'LOW_AI_CONFIDENCE',
            'AMBIGUOUS_RESPONSE', 'PATIENT_REQUESTED_HUMAN',
            'DATA_CONFLICT', 'BOOKING_FAILURE'
        )),
    ai_output       JSONB,
    human_decision  TEXT        CHECK (human_decision IN ('APPROVE', 'CORRECT', 'ESCALATE', 'REJECT')),
    human_notes     TEXT,
    reviewer_id     UUID,
    resolved        BOOLEAN     NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ
);

COMMENT ON TABLE human_reviews IS
    'Human-review queue for AI-flagged or patient-requested escalations.';

CREATE INDEX idx_human_reviews_patient_id ON human_reviews (patient_id);
CREATE INDEX idx_human_reviews_resolved   ON human_reviews (resolved);
CREATE INDEX idx_human_reviews_reason      ON human_reviews (reason);

-- ----------------------------------------------------------------------------
-- 7. error_logs
--    Best-effort log of errors from external service calls (WhatsApp API,
--    calendar API, etc.) so that failures can be inspected and retried.
-- ----------------------------------------------------------------------------
CREATE TABLE error_logs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    UUID        REFERENCES patients (id) ON DELETE SET NULL,
    service       TEXT        NOT NULL,
    operation     TEXT        NOT NULL,
    error_message TEXT        NOT NULL,
    retry_count   INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE error_logs IS
    'Error log for external service failures with retry tracking.';

CREATE INDEX idx_error_logs_service    ON error_logs (service);
CREATE INDEX idx_error_logs_created_at ON error_logs (created_at);

-- ============================================================================
-- Utility function: clean_expired_pending_bookings
--
-- Removes all pending_bookings rows whose expires_at has passed.  The
-- application must invoke this function BEFORE attempting to insert a new
-- pending_booking for a given (calendar_id, requested_slot) pair so that
-- expired locks do not cause unique-constraint violations.
-- ============================================================================
CREATE OR REPLACE FUNCTION clean_expired_pending_bookings()
RETURNS INTEGER
LANGUAGE plpgsql
STRICT
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM pending_bookings
    WHERE expires_at < now()
    RETURNING *;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION clean_expired_pending_bookings() IS
    'Deletes expired pending_booking locks and returns the number of rows removed.  Call before inserting a new lock for the same slot.';

COMMIT;
