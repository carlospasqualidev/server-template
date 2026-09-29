-- DropIndex
DROP INDEX "audit_logs_companyId_module_entity_entityId_idx";

-- CreateIndex
CREATE INDEX "audit_logs_companyId_entity_entityId_idx" ON "audit_logs"("companyId", "entity", "entityId");
