-- CreateEnum
CREATE TYPE "AuditModule" AS ENUM ('USERS', 'SECURITY', 'SETTINGS');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('create', 'update', 'delete', 'statusChange', 'login');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "module" "AuditModule" NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "action" "AuditAction" NOT NULL,
    "description" TEXT,
    "before" JSONB,
    "after" JSONB,
    "changedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "userId" TEXT,
    "requestId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_companyId_createdAt_idx" ON "audit_logs"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_module_entity_entityId_idx" ON "audit_logs"("companyId", "module", "entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
