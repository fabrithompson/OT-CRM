-- ──────────────────────────────────────────────────────────────────────────────
-- V2: Sistema de Agente IA
-- ──────────────────────────────────────────────────────────────────────────────

-- Configuración del agente IA por agencia
CREATE TABLE IF NOT EXISTS agent_config (
    id               BIGSERIAL PRIMARY KEY,
    agencia_id       BIGINT      NOT NULL UNIQUE REFERENCES agencias(id) ON DELETE CASCADE,
    instructions     TEXT,
    business_context TEXT,
    human_sector_id  BIGINT      REFERENCES etapas(id) ON DELETE SET NULL,
    enabled          BOOLEAN     NOT NULL DEFAULT false,
    created_at       TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Estado IA por conversación (cliente)
CREATE TABLE IF NOT EXISTS ai_conversation_state (
    cliente_id  BIGINT      PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
    status      VARCHAR(20) NOT NULL DEFAULT 'AI_HANDLING',
    sector_id   BIGINT      REFERENCES etapas(id) ON DELETE SET NULL,
    updated_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conv_state_status ON ai_conversation_state(status);
