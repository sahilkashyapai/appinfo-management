-- CreateTable
CREATE TABLE `bank_details` (
    `id` VARCHAR(32) NOT NULL,
    `userId` VARCHAR(32) NULL,
    `employeeId` VARCHAR(32) NULL,
    `pan` VARCHAR(20) NOT NULL DEFAULT '',
    `accountHolder` VARCHAR(191) NOT NULL DEFAULT '',
    `bankName` VARCHAR(191) NOT NULL DEFAULT '',
    `bankAccount` VARCHAR(50) NOT NULL DEFAULT '',
    `ifsc` VARCHAR(20) NOT NULL DEFAULT '',
    `lockedAt` DATETIME(3) NULL,
    `updatedById` VARCHAR(32) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bank_details_userId_key`(`userId`),
    UNIQUE INDEX `bank_details_employeeId_key`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bank_detail_requests` (
    `id` VARCHAR(32) NOT NULL,
    `userId` VARCHAR(32) NOT NULL,
    `employeeId` VARCHAR(32) NULL,
    `pan` VARCHAR(20) NOT NULL DEFAULT '',
    `accountHolder` VARCHAR(191) NOT NULL DEFAULT '',
    `bankName` VARCHAR(191) NOT NULL DEFAULT '',
    `bankAccount` VARCHAR(50) NOT NULL DEFAULT '',
    `ifsc` VARCHAR(20) NOT NULL DEFAULT '',
    `reason` TEXT NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `decidedById` VARCHAR(32) NULL,
    `decisionNote` TEXT NULL,
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `bank_detail_requests_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bank_details` ADD CONSTRAINT `bank_details_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_details` ADD CONSTRAINT `bank_details_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_detail_requests` ADD CONSTRAINT `bank_detail_requests_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_detail_requests` ADD CONSTRAINT `bank_detail_requests_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_detail_requests` ADD CONSTRAINT `bank_detail_requests_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
