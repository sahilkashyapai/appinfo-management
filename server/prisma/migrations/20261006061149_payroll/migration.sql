-- AlterTable
ALTER TABLE `settings` ADD COLUMN `payroll` JSON NULL;

-- CreateTable
CREATE TABLE `salary_structures` (
    `id` VARCHAR(32) NOT NULL,
    `employeeId` VARCHAR(32) NOT NULL,
    `earnings` JSON NOT NULL,
    `deductions` JSON NOT NULL,
    `pfApplicable` BOOLEAN NOT NULL DEFAULT true,
    `esiApplicable` BOOLEAN NOT NULL DEFAULT true,
    `ptApplicable` BOOLEAN NOT NULL DEFAULT true,
    `pan` VARCHAR(20) NOT NULL DEFAULT '',
    `uan` VARCHAR(20) NOT NULL DEFAULT '',
    `bankName` VARCHAR(191) NOT NULL DEFAULT '',
    `bankAccount` VARCHAR(50) NOT NULL DEFAULT '',
    `ifsc` VARCHAR(20) NOT NULL DEFAULT '',
    `updatedById` VARCHAR(32) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `salary_structures_employeeId_key`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `salary_slips` (
    `id` VARCHAR(32) NOT NULL,
    `employeeId` VARCHAR(32) NOT NULL,
    `period` VARCHAR(7) NOT NULL,
    `status` ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    `currency` VARCHAR(3) NOT NULL,
    `office` VARCHAR(191) NOT NULL DEFAULT '',
    `employeeInfo` JSON NOT NULL,
    `daysInMonth` INTEGER NOT NULL,
    `paidDays` DECIMAL(5, 1) NOT NULL,
    `lopDays` DECIMAL(5, 1) NOT NULL,
    `earnings` JSON NOT NULL,
    `deductions` JSON NOT NULL,
    `grossEarnings` DECIMAL(12, 2) NOT NULL,
    `totalDeductions` DECIMAL(12, 2) NOT NULL,
    `netPay` DECIMAL(12, 2) NOT NULL,
    `notes` TEXT NULL,
    `documentId` VARCHAR(32) NULL,
    `generatedById` VARCHAR(32) NULL,
    `publishedById` VARCHAR(32) NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `salary_slips_documentId_key`(`documentId`),
    INDEX `salary_slips_period_status_idx`(`period`, `status`),
    UNIQUE INDEX `salary_slips_employeeId_period_key`(`employeeId`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `salary_structures` ADD CONSTRAINT `salary_structures_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salary_structures` ADD CONSTRAINT `salary_structures_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salary_slips` ADD CONSTRAINT `salary_slips_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salary_slips` ADD CONSTRAINT `salary_slips_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salary_slips` ADD CONSTRAINT `salary_slips_generatedById_fkey` FOREIGN KEY (`generatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salary_slips` ADD CONSTRAINT `salary_slips_publishedById_fkey` FOREIGN KEY (`publishedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
