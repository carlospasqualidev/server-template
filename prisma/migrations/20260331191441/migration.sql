-- CreateEnum
CREATE TYPE "CustomFieldPersonType" AS ENUM ('NATURAL', 'LEGAL', 'BOTH');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('STRING', 'NUMBER', 'DATE', 'DATETIME', 'CHECKBOX', 'FILE', 'SELECT');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('PHOTO', 'VIDEO', 'PDF', 'ALL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "password" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessLogs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "accessLogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "observation" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "naturalPersons" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "cpf" TEXT,
    "fullName" TEXT NOT NULL,
    "genderId" TEXT,
    "birthDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "naturalPersons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legalPersons" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "cnpj" TEXT,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legalPersons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personAddresses" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "cep" TEXT,
    "street" TEXT,
    "neighborhood" TEXT,
    "number" TEXT,
    "city" TEXT,
    "state" TEXT,
    "complement" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personAddresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personEmails" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personEmails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personPhones" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personPhones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "genders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personPartnerships" (
    "legalPersonId" TEXT NOT NULL,
    "naturalPersonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personPartnerships_pkey" PRIMARY KEY ("legalPersonId","naturalPersonId")
);

-- CreateTable
CREATE TABLE "customFields" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "personType" "CustomFieldPersonType" NOT NULL,
    "fieldType" "FieldType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "authorId" TEXT NOT NULL,

    CONSTRAINT "customFields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customFieldFileTypes" (
    "id" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,
    "type" "FileType" NOT NULL,

    CONSTRAINT "customFieldFileTypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selectOptions" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,

    CONSTRAINT "selectOptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customFieldLogs" (
    "id" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "oldData" JSONB,
    "newData" JSONB,

    CONSTRAINT "customFieldLogs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "naturalPersons_personId_key" ON "naturalPersons"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "naturalPersons_cpf_key" ON "naturalPersons"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "legalPersons_personId_key" ON "legalPersons"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "legalPersons_cnpj_key" ON "legalPersons"("cnpj");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessLogs" ADD CONSTRAINT "accessLogs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "naturalPersons" ADD CONSTRAINT "naturalPersons_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "naturalPersons" ADD CONSTRAINT "naturalPersons_genderId_fkey" FOREIGN KEY ("genderId") REFERENCES "genders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legalPersons" ADD CONSTRAINT "legalPersons_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personAddresses" ADD CONSTRAINT "personAddresses_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personEmails" ADD CONSTRAINT "personEmails_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personPhones" ADD CONSTRAINT "personPhones_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personPartnerships" ADD CONSTRAINT "personPartnerships_legalPersonId_fkey" FOREIGN KEY ("legalPersonId") REFERENCES "legalPersons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personPartnerships" ADD CONSTRAINT "personPartnerships_naturalPersonId_fkey" FOREIGN KEY ("naturalPersonId") REFERENCES "naturalPersons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customFields" ADD CONSTRAINT "customFields_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customFields" ADD CONSTRAINT "customFields_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customFieldFileTypes" ADD CONSTRAINT "customFieldFileTypes_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "customFields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selectOptions" ADD CONSTRAINT "selectOptions_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "customFields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customFieldLogs" ADD CONSTRAINT "customFieldLogs_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "customFields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customFieldLogs" ADD CONSTRAINT "customFieldLogs_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
