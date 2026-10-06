-- AlterTable
ALTER TABLE `salary_slips` ADD COLUMN `daysWorked` DECIMAL(5, 1) NULL,
    ADD COLUMN `leaveBalances` JSON NULL,
    ADD COLUMN `workingDays` INTEGER NULL;

-- AlterTable
ALTER TABLE `salary_structures` ADD COLUMN `address` TEXT NULL,
    ADD COLUMN `epfNumber` VARCHAR(30) NOT NULL DEFAULT '',
    ADD COLUMN `esiNumber` VARCHAR(30) NOT NULL DEFAULT '';
