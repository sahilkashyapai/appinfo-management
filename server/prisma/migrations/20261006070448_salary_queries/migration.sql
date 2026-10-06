-- CreateTable
CREATE TABLE `salary_queries` (
    `id` VARCHAR(32) NOT NULL,
    `slipId` VARCHAR(32) NOT NULL,
    `employeeId` VARCHAR(32) NOT NULL,
    `raisedById` VARCHAR(32) NULL,
    `message` TEXT NOT NULL,
    `status` ENUM('open', 'resolved', 'rejected') NOT NULL DEFAULT 'open',
    `response` TEXT NULL,
    `respondedById` VARCHAR(32) NULL,
    `respondedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `salary_queries_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `salary_queries_employeeId_idx`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `salary_queries` ADD CONSTRAINT `salary_queries_slipId_fkey` FOREIGN KEY (`slipId`) REFERENCES `salary_slips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salary_queries` ADD CONSTRAINT `salary_queries_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salary_queries` ADD CONSTRAINT `salary_queries_raisedById_fkey` FOREIGN KEY (`raisedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salary_queries` ADD CONSTRAINT `salary_queries_respondedById_fkey` FOREIGN KEY (`respondedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
