ALTER TABLE service_requests
  ADD COLUMN pickup_pin_hash varchar(255),
  ADD COLUMN pickup_pin_encrypted text,
  ADD COLUMN pickup_verified_at timestamptz,
  ADD COLUMN share_token varchar(100),
  ADD COLUMN beneficiary_name varchar(120),
  ADD COLUMN beneficiary_phone varchar(20),
  ADD COLUMN scheduled_for timestamptz,
  ADD COLUMN rating_provider_to_customer integer,
  ADD COLUMN provider_review_text text;

CREATE UNIQUE INDEX service_requests_share_token_key ON service_requests(share_token);
ALTER TABLE service_requests ADD CONSTRAINT service_requests_provider_rating_check CHECK (rating_provider_to_customer IS NULL OR rating_provider_to_customer BETWEEN 1 AND 5);

CREATE TABLE support_cases (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid REFERENCES service_requests(id) ON DELETE SET NULL,
  subject varchar(160) NOT NULL,
  message text NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_cases_user_id_created_at_idx ON support_cases(user_id, created_at);
CREATE INDEX support_cases_status_created_at_idx ON support_cases(status, created_at);
