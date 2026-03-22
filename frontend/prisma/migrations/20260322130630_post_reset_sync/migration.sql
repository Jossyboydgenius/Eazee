-- CreateTable
CREATE TABLE "telegram_bindings" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_verified_at" TIMESTAMP(3),

    CONSTRAINT "telegram_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_binding_tokens" (
    "token_hash" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "telegram_binding_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "dispatch_jobs" (
    "id" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "template_name" TEXT,
    "template_language_code" TEXT,
    "template_body_parameters" JSONB,
    "template_header_image_url" TEXT,
    "post_type" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "photos" JSONB NOT NULL,
    "has_celo_payment" BOOLEAN NOT NULL DEFAULT false,
    "price" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "wa_account" TEXT NOT NULL,
    "send_time" TEXT NOT NULL,
    "repeat_value" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "targets" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "message_ids" JSONB,
    "owner_chat_id" TEXT,
    "owner_wallet_address" TEXT,
    "idempotency_key" TEXT,

    CONSTRAINT "dispatch_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_receipts" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "recipient" TEXT,
    "status" TEXT NOT NULL,
    "message_id" TEXT,
    "error" TEXT,
    "attempted_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatch_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_webhook_events" (
    "id" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "whatsapp_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_auth_challenges" (
    "nonce" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "chat_id" TEXT,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "wallet_auth_challenges_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "wallet_auth_sessions" (
    "token_hash" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "chat_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "wallet_auth_sessions_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "chain_id" INTEGER NOT NULL DEFAULT 11142220,
    "contract_address" TEXT NOT NULL,
    "buyer" TEXT NOT NULL,
    "seller" TEXT NOT NULL,
    "token_address" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "escrow_id" INTEGER,
    "escrow_status" TEXT NOT NULL DEFAULT 'pending',
    "owner_wallet_address" TEXT NOT NULL,
    "block_number" BIGINT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_bindings_chat_id_key" ON "telegram_bindings"("chat_id");

-- CreateIndex
CREATE INDEX "idx_telegram_bindings_wallet" ON "telegram_bindings"("wallet_address");

-- CreateIndex
CREATE INDEX "idx_telegram_binding_tokens_chat" ON "telegram_binding_tokens"("chat_id");

-- CreateIndex
CREATE INDEX "idx_telegram_binding_tokens_wallet" ON "telegram_binding_tokens"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_jobs_idempotency_key_key" ON "dispatch_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "idx_dispatch_jobs_status_time" ON "dispatch_jobs"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "idx_dispatch_jobs_owner_chat" ON "dispatch_jobs"("owner_chat_id");

-- CreateIndex
CREATE INDEX "idx_dispatch_jobs_owner_wallet" ON "dispatch_jobs"("owner_wallet_address");

-- CreateIndex
CREATE INDEX "idx_dispatch_receipts_job" ON "dispatch_receipts"("job_id");

-- CreateIndex
CREATE INDEX "idx_whatsapp_webhook_events_received_at" ON "whatsapp_webhook_events"("received_at");

-- CreateIndex
CREATE INDEX "idx_wallet_auth_challenges_wallet" ON "wallet_auth_challenges"("wallet_address", "created_at");

-- CreateIndex
CREATE INDEX "idx_wallet_auth_sessions_wallet" ON "wallet_auth_sessions"("wallet_address", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_tx_hash_key" ON "payment_transactions"("tx_hash");

-- CreateIndex
CREATE INDEX "idx_payment_transactions_owner_time" ON "payment_transactions"("owner_wallet_address", "created_at");

-- CreateIndex
CREATE INDEX "idx_payment_transactions_tx_hash" ON "payment_transactions"("tx_hash");

-- AddForeignKey
ALTER TABLE "dispatch_receipts" ADD CONSTRAINT "dispatch_receipts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "dispatch_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
