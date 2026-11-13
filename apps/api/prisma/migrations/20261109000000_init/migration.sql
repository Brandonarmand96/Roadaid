-- Enable PostGIS and pgcrypto extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'PROVIDER', 'ADMIN');
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'OPERATIONS', 'FINANCE');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE "ServiceType" AS ENUM ('FUEL', 'TOWING', 'LOCKOUT');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "OnboardingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "ProviderAvailability" AS ENUM ('OFFLINE', 'ONLINE', 'RESERVED', 'BUSY', 'UNAVAILABLE');
CREATE TYPE "RequestStatus" AS ENUM ('REQUESTED', 'SEARCHING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ESCALATED');
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('NONE', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');
CREATE TYPE "CancelledBy" AS ENUM ('CUSTOMER', 'PROVIDER', 'ADMIN', 'SYSTEM');
CREATE TYPE "PayoutStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PAID', 'REJECTED');
CREATE TYPE "LedgerEntryType" AS ENUM ('CUSTOMER_PAYMENT', 'PROVIDER_EARNING', 'PLATFORM_COMMISSION', 'PAYOUT', 'REFUND', 'ADJUSTMENT');
CREATE TYPE "VehicleType" AS ENUM ('CAR', 'SUV', 'VAN', 'TRUCK', 'MOTORCYCLE');
CREATE TYPE "DocumentType" AS ENUM ('NATIONAL_ID', 'DRIVERS_LICENCE', 'VEHICLE_PAPERS', 'EQUIPMENT_PHOTO', 'PROFILE_PHOTO', 'OTHER');
CREATE TYPE "PaymentGateway" AS ENUM ('PAYSTACK', 'FLUTTERWAVE', 'MANUAL');

-- Users table
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "password_hash" VARCHAR(255),
    "full_name" VARCHAR(255),
    "avatar_url" VARCHAR(1024),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "admin_role" "AdminRole",
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- OTP Codes
CREATE TABLE "otp_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" VARCHAR(20) NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "purpose" VARCHAR(50) NOT NULL DEFAULT 'LOGIN',
    "expires_at" TIMESTAMPTZ NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "otp_codes_phone_purpose_idx" ON "otp_codes"("phone", "purpose");

-- Refresh Tokens
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "device_info" VARCHAR(255),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- Device Tokens
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "token" VARCHAR(512) NOT NULL,
    "app" VARCHAR(20) NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens"("user_id");

-- Customer Vehicles
CREATE TABLE "customer_vehicles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "make" VARCHAR(100) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "color" VARCHAR(50) NOT NULL,
    "plate_number" VARCHAR(30) NOT NULL,
    "vehicle_type" "VehicleType" NOT NULL DEFAULT 'CAR',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_vehicles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_vehicles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "customer_vehicles_customer_id_idx" ON "customer_vehicles"("customer_id");

-- Provider Profiles
CREATE TABLE "provider_profiles" (
    "user_id" UUID NOT NULL,
    "business_name" VARCHAR(255),
    "address" VARCHAR(500),
    "availability" "ProviderAvailability" NOT NULL DEFAULT 'OFFLINE',
    "current_request_id" UUID,
    "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 5.0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "completed_jobs" INTEGER NOT NULL DEFAULT 0,
    "vehicle_make" VARCHAR(100),
    "vehicle_model" VARCHAR(100),
    "vehicle_plate" VARCHAR(30),
    "equipment_notes" TEXT,
    "onboarding_status" "OnboardingStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "wallet_balance_kobo" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_profiles_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "provider_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Provider Services
CREATE TABLE "provider_services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_id" UUID NOT NULL,
    "service_type" "ServiceType" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "details" JSONB,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_services_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "provider_services_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "provider_services_provider_id_service_type_key" ON "provider_services"("provider_id", "service_type");

-- Provider Documents
CREATE TABLE "provider_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_id" UUID NOT NULL,
    "service_type" "ServiceType",
    "doc_type" "DocumentType" NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "provider_documents_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "provider_documents_provider_id_idx" ON "provider_documents"("provider_id");

-- Provider Locations (Latest upsert)
CREATE TABLE "provider_locations" (
    "provider_id" UUID NOT NULL,
    "location" GEOGRAPHY(Point, 4326),
    "heading" DOUBLE PRECISION,
    "speed_mps" DOUBLE PRECISION,
    "accuracy_m" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_locations_pkey" PRIMARY KEY ("provider_id"),
    CONSTRAINT "provider_locations_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Provider Location History
CREATE TABLE "provider_location_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_id" UUID NOT NULL,
    "request_id" UUID,
    "location" GEOGRAPHY(Point, 4326),
    "accuracy_m" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_location_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "provider_location_history_provider_id_recorded_at_idx" ON "provider_location_history"("provider_id", "recorded_at");

-- Pricing Rules
CREATE TABLE "pricing_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_type" "ServiceType" NOT NULL,
    "base_kobo" BIGINT NOT NULL,
    "per_km_kobo" BIGINT NOT NULL DEFAULT 0,
    "per_litre_kobo" BIGINT NOT NULL DEFAULT 0,
    "min_kobo" BIGINT NOT NULL,
    "towing_free_km" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pricing_rules_service_type_key" ON "pricing_rules"("service_type");

-- Dispatch Settings
CREATE TABLE "dispatch_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_type" "ServiceType" NOT NULL,
    "offer_timeout_seconds" INTEGER NOT NULL DEFAULT 30,
    "search_radius_km" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "max_offers" INTEGER NOT NULL DEFAULT 5,
    "candidate_shortlist_size" INTEGER NOT NULL DEFAULT 5,
    "stale_location_seconds" INTEGER NOT NULL DEFAULT 90,
    "max_search_duration_seconds" INTEGER NOT NULL DEFAULT 600,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dispatch_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "dispatch_settings_service_type_key" ON "dispatch_settings"("service_type");

-- Commission Settings
CREATE TABLE "commission_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_type" "ServiceType" NOT NULL,
    "commission_bps" INTEGER NOT NULL DEFAULT 1500,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "commission_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "commission_settings_service_type_key" ON "commission_settings"("service_type");

-- Service Requests
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "customer_id" UUID NOT NULL,
    "service_type" "ServiceType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "provider_id" UUID,
    "vehicle_id" UUID,
    "vehicle_snapshot" JSONB,
    "details" JSONB NOT NULL,
    "pickup_location" GEOGRAPHY(Point, 4326),
    "pickup_address" VARCHAR(500) NOT NULL,
    "pickup_note" TEXT,
    "distance_km" DOUBLE PRECISION,
    "price_kobo" BIGINT NOT NULL,
    "price_breakdown" JSONB NOT NULL,
    "commission_bps" INTEGER NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'NONE',
    "payment_mode" VARCHAR(50) NOT NULL DEFAULT 'ONLINE_AFTER_ACCEPT',
    "current_offer_id" UUID,
    "offers_made_count" INTEGER NOT NULL DEFAULT 0,
    "eta_seconds" INTEGER,
    "accepted_at" TIMESTAMPTZ,
    "arrived_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" "CancelledBy",
    "cancel_reason" TEXT,
    "cancel_fee_kobo" BIGINT NOT NULL DEFAULT 0,
    "search_started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "escalated_at" TIMESTAMPTZ,
    "rating_customer_to_provider" INTEGER,
    "review_text" TEXT,
    "dispute_flag" BOOLEAN NOT NULL DEFAULT false,
    "dispute_reason" TEXT,
    "disputed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "service_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "service_requests_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_requests_code_key" ON "service_requests"("code");
CREATE INDEX "service_requests_customer_id_idx" ON "service_requests"("customer_id");
CREATE INDEX "service_requests_provider_id_idx" ON "service_requests"("provider_id");

-- Request Events
CREATE TABLE "request_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "actor_type" VARCHAR(50) NOT NULL,
    "actor_id" UUID,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "request_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "request_events_request_id_created_at_idx" ON "request_events"("request_id", "created_at");

-- Dispatch Offers
CREATE TABLE "dispatch_offers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "offered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "responded_at" TIMESTAMPTZ,
    "distance_m_at_offer" DOUBLE PRECISION,
    "eta_seconds_at_offer" INTEGER,
    "expiry_job_id" VARCHAR(255),
    "decline_reason" TEXT,
    "round" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dispatch_offers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dispatch_offers_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "dispatch_offers_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "dispatch_offers_request_id_provider_id_round_key" ON "dispatch_offers"("request_id", "provider_id", "round");

-- Payments
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "gateway" "PaymentGateway" NOT NULL DEFAULT 'PAYSTACK',
    "reference" VARCHAR(100) NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "gateway_response" JSONB,
    "paid_at" TIMESTAMPTZ,
    "idempotency_key" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");
CREATE INDEX "payments_request_id_idx" ON "payments"("request_id");
CREATE INDEX "payments_customer_id_idx" ON "payments"("customer_id");

-- Webhook Events
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gateway" VARCHAR(50) NOT NULL,
    "event_id" VARCHAR(255) NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webhook_events_gateway_event_id_key" ON "webhook_events"("gateway", "event_id");

-- Ledger Entries
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "LedgerEntryType" NOT NULL,
    "request_id" UUID,
    "payment_id" UUID,
    "provider_id" UUID,
    "amount_kobo" BIGINT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ledger_entries_provider_id_idx" ON "ledger_entries"("provider_id");
CREATE INDEX "ledger_entries_request_id_idx" ON "ledger_entries"("request_id");

-- Payout Requests
CREATE TABLE "payout_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_id" UUID NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "bank_name" VARCHAR(100) NOT NULL,
    "account_number" VARCHAR(20) NOT NULL,
    "account_name" VARCHAR(255) NOT NULL,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "paid_reference" VARCHAR(255),
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payout_requests_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "payout_requests_provider_id_idx" ON "payout_requests"("provider_id");

-- Provider Bank Accounts
CREATE TABLE "provider_bank_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_id" UUID NOT NULL,
    "bank_name" VARCHAR(100) NOT NULL,
    "account_number" VARCHAR(20) NOT NULL,
    "account_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_bank_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "provider_bank_accounts_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "provider_bank_accounts_provider_id_account_number_key" ON "provider_bank_accounts"("provider_id", "account_number");

-- Notifications
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- Audit Logs
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID NOT NULL,
    "actor_role" VARCHAR(50) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(100) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- =========================================================================
-- MANDATORY DATABASE CONSTRAINTS FROM SPEC SECTION 5.3
-- =========================================================================

-- 1. A provider may have at most ONE active request at any time.
CREATE UNIQUE INDEX uq_provider_one_active_request
  ON service_requests (provider_id)
  WHERE provider_id IS NOT NULL
    AND status IN ('ASSIGNED','EN_ROUTE','ARRIVED','IN_PROGRESS');

-- 2. A request may have at most ONE pending offer at a time.
CREATE UNIQUE INDEX uq_request_one_pending_offer
  ON dispatch_offers (request_id) WHERE status = 'PENDING';

-- 3. A provider may have at most ONE pending offer at a time.
CREATE UNIQUE INDEX uq_provider_one_pending_offer
  ON dispatch_offers (provider_id) WHERE status = 'PENDING';

-- 4. Spatial and search indexes
CREATE INDEX idx_provider_locations_gist ON provider_locations USING GIST (location);
CREATE INDEX idx_requests_status ON service_requests (status, created_at);
CREATE INDEX idx_offers_expiry ON dispatch_offers (expires_at) WHERE status = 'PENDING';
