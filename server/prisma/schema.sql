-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(32) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` ENUM('proadmin', 'superadmin', 'admin', 'developer', 'employee') NOT NULL DEFAULT 'employee',
    `employeeId` VARCHAR(32) NULL,
    `managedLocation` VARCHAR(191) NOT NULL DEFAULT '',
    `managedBranch` VARCHAR(191) NOT NULL DEFAULT '',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `avatarIndex` INTEGER NOT NULL DEFAULT 0,
    `avatarUrl` LONGTEXT NULL,
    `phone` VARCHAR(50) NOT NULL DEFAULT '',
    `department` VARCHAR(191) NOT NULL DEFAULT '',
    `location` VARCHAR(191) NOT NULL DEFAULT '',
    `branch` VARCHAR(191) NOT NULL DEFAULT 'Headquarters',
    `empId` VARCHAR(50) NOT NULL DEFAULT '',
    `dob` DATETIME(3) NULL,
    `joined` DATETIME(3) NULL,
    `approvalStatus` ENUM('approved', 'pending', 'rejected') NOT NULL DEFAULT 'approved',
    `rejectionReason` TEXT NULL,
    `failedAttempts` INTEGER NOT NULL DEFAULT 0,
    `lockUntil` DATETIME(3) NULL,
    `lastLogin` DATETIME(3) NULL,
    `totpEnabled` BOOLEAN NOT NULL DEFAULT false,
    `totpSecret` VARCHAR(255) NULL,
    `passwordResetToken` VARCHAR(255) NULL,
    `passwordResetExpires` DATETIME(3) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `promotedAdmin` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_employeeId_idx`(`employeeId`),
    INDEX `users_role_idx`(`role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employees` (
    `id` VARCHAR(32) NOT NULL,
    `empId` VARCHAR(50) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `deptId` VARCHAR(32) NOT NULL,
    `dept` VARCHAR(191) NOT NULL,
    `desig` VARCHAR(191) NOT NULL,
    `roleLabel` VARCHAR(100) NOT NULL DEFAULT 'Engineer / Developer',
    `joined` DATETIME(3) NOT NULL,
    `dob` DATETIME(3) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(50) NOT NULL DEFAULT '',
    `location` VARCHAR(191) NOT NULL DEFAULT '',
    `status` ENUM('active', 'inactive', 'leave') NOT NULL DEFAULT 'active',
    `managerId` VARCHAR(32) NULL,
    `userId` VARCHAR(32) NULL,
    `avatarIndex` INTEGER NOT NULL DEFAULT 0,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `employees_empId_key`(`empId`),
    UNIQUE INDEX `employees_email_key`(`email`),
    INDEX `employees_deptId_idx`(`deptId`),
    INDEX `employees_managerId_idx`(`managerId`),
    INDEX `employees_userId_idx`(`userId`),
    INDEX `employees_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `departments` (
    `id` VARCHAR(32) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `headId` VARCHAR(32) NULL,
    `icon` VARCHAR(100) NOT NULL DEFAULT 'fa-solid fa-building',
    `color` VARCHAR(20) NOT NULL DEFAULT '#2E86AB',
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `departments_name_key`(`name`),
    UNIQUE INDEX `departments_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance` (
    `id` VARCHAR(32) NOT NULL,
    `employeeId` VARCHAR(32) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `status` ENUM('office', 'wfh', 'leave', 'absent') NOT NULL,
    `note` TEXT NULL,
    `markedById` VARCHAR(32) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `attendance_date_idx`(`date`),
    UNIQUE INDEX `attendance_employeeId_date_key`(`employeeId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_correction_requests` (
    `id` VARCHAR(32) NOT NULL,
    `employeeId` VARCHAR(32) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `currentStatus` ENUM('office', 'wfh', 'leave', 'absent', 'not_marked') NOT NULL,
    `requestedStatus` ENUM('office', 'wfh', 'leave', 'absent') NOT NULL,
    `reason` TEXT NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `decidedById` VARCHAR(32) NULL,
    `decisionNote` TEXT NULL,
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `attendance_correction_requests_employeeId_date_idx`(`employeeId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_requests` (
    `id` VARCHAR(32) NOT NULL,
    `employeeId` VARCHAR(32) NOT NULL,
    `type` ENUM('casual', 'sick', 'earned') NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `days` DOUBLE NOT NULL,
    `reason` TEXT NOT NULL,
    `status` ENUM('pending', 'on_hold', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
    `approverId` VARCHAR(32) NULL,
    `approverNote` TEXT NULL,
    `decidedAt` DATETIME(3) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `leave_requests_employeeId_status_idx`(`employeeId`, `status`),
    INDEX `leave_requests_employeeId_startDate_idx`(`employeeId`, `startDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_comments` (
    `id` VARCHAR(32) NOT NULL,
    `leaveRequestId` VARCHAR(32) NOT NULL,
    `authorId` VARCHAR(32) NOT NULL,
    `text` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `leave_comments_leaveRequestId_idx`(`leaveRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `time_logs` (
    `id` VARCHAR(32) NOT NULL,
    `userId` VARCHAR(32) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `stoppedAt` DATETIME(3) NULL,
    `status` ENUM('running', 'paused', 'stopped') NOT NULL DEFAULT 'running',
    `pausedAt` DATETIME(3) NULL,
    `totalPausedMs` BIGINT NOT NULL DEFAULT 0,
    `autoStopped` BOOLEAN NOT NULL DEFAULT false,
    `ip` VARCHAR(64) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `time_logs_status_idx`(`status`),
    UNIQUE INDEX `time_logs_userId_date_key`(`userId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `holidays` (
    `id` VARCHAR(32) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `type` ENUM('National', 'Festival', 'Optional') NOT NULL DEFAULT 'National',
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `holidays_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` VARCHAR(32) NOT NULL,
    `employeeId` VARCHAR(32) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('aadhar', 'pan', 'passport', 'joining_letter', 'offer_letter', 'salary_slip', 'experience_letter', 'salary_certificate', 'form16', 'id_proof', 'certificate', 'other') NOT NULL DEFAULT 'other',
    `fileName` VARCHAR(255) NOT NULL DEFAULT '',
    `fileType` VARCHAR(100) NOT NULL DEFAULT '',
    `fileUrl` LONGTEXT NOT NULL,
    `uploadedById` VARCHAR(32) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `documents_employeeId_createdAt_idx`(`employeeId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_requests` (
    `id` VARCHAR(32) NOT NULL,
    `employeeId` VARCHAR(32) NOT NULL,
    `type` ENUM('salary_slip', 'experience_letter', 'relieving_letter', 'salary_certificate', 'form16', 'other') NOT NULL,
    `period` VARCHAR(50) NOT NULL DEFAULT '',
    `note` TEXT NULL,
    `status` ENUM('pending', 'fulfilled', 'rejected') NOT NULL DEFAULT 'pending',
    `documentId` VARCHAR(32) NULL,
    `decidedById` VARCHAR(32) NULL,
    `decisionNote` TEXT NULL,
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `document_requests_employeeId_status_idx`(`employeeId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assets` (
    `id` VARCHAR(32) NOT NULL,
    `employeeId` VARCHAR(32) NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('laptop', 'mobile', 'id_card', 'access_card', 'other') NOT NULL DEFAULT 'other',
    `serialNumber` VARCHAR(191) NOT NULL DEFAULT '',
    `status` ENUM('unassigned', 'assigned', 'returned', 'damaged', 'lost') NOT NULL DEFAULT 'unassigned',
    `assignedAt` DATETIME(3) NULL,
    `returnedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `assets_employeeId_idx`(`employeeId`),
    INDEX `assets_serialNumber_idx`(`serialNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `events` (
    `id` VARCHAR(32) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `type` ENUM('festival', 'workshop', 'town_hall', 'team_outing', 'sports', 'birthday', 'other') NOT NULL DEFAULT 'other',
    `date` DATETIME(3) NOT NULL,
    `venue` VARCHAR(255) NOT NULL DEFAULT '',
    `status` ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    `emoji` VARCHAR(100) NOT NULL DEFAULT 'fa-solid fa-calendar-days',
    `color` VARCHAR(20) NOT NULL DEFAULT '#2E86AB',
    `capacity` INTEGER NOT NULL DEFAULT 100,
    `createdById` VARCHAR(32) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `events_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rsvps` (
    `id` VARCHAR(32) NOT NULL,
    `eventId` VARCHAR(32) NOT NULL,
    `employeeId` VARCHAR(32) NOT NULL,
    `status` ENUM('yes', 'maybe', 'no') NOT NULL,
    `respondedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `rsvps_eventId_employeeId_key`(`eventId`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcements` (
    `id` VARCHAR(32) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `body` TEXT NOT NULL,
    `type` ENUM('general', 'hiring') NOT NULL DEFAULT 'general',
    `priority` ENUM('high', 'medium', 'low') NOT NULL DEFAULT 'medium',
    `icon` VARCHAR(100) NOT NULL DEFAULT 'fa-solid fa-bullhorn',
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `postedById` VARCHAR(32) NULL,
    `scheduledAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(32) NOT NULL,
    `recipientId` VARCHAR(32) NULL,
    `icon` VARCHAR(100) NOT NULL DEFAULT 'fa-solid fa-bell',
    `bg` VARCHAR(20) NOT NULL DEFAULT '#EBF5FB',
    `title` VARCHAR(255) NOT NULL,
    `body` TEXT NOT NULL,
    `type` VARCHAR(50) NOT NULL DEFAULT 'info',
    `link` VARCHAR(255) NOT NULL DEFAULT '',
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `aboutEmployeeId` VARCHAR(32) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `notifications_recipientId_createdAt_idx`(`recipientId`, `createdAt`),
    INDEX `notifications_title_createdAt_idx`(`title`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_reads` (
    `notificationId` VARCHAR(32) NOT NULL,
    `userId` VARCHAR(32) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_reads_userId_idx`(`userId`),
    PRIMARY KEY (`notificationId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_clears` (
    `notificationId` VARCHAR(32) NOT NULL,
    `userId` VARCHAR(32) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_clears_userId_idx`(`userId`),
    PRIMARY KEY (`notificationId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `push_subscriptions` (
    `id` VARCHAR(32) NOT NULL,
    `userId` VARCHAR(32) NOT NULL,
    `endpoint` VARCHAR(512) NOT NULL,
    `p256dh` VARCHAR(255) NOT NULL,
    `auth` VARCHAR(255) NOT NULL,
    `userAgent` VARCHAR(512) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `push_subscriptions_endpoint_key`(`endpoint`),
    INDEX `push_subscriptions_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversations` (
    `id` VARCHAR(32) NOT NULL,
    `isGroup` BOOLEAN NOT NULL DEFAULT false,
    `name` VARCHAR(191) NOT NULL DEFAULT '',
    `createdById` VARCHAR(32) NULL,
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastMessageText` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `conversations_lastMessageAt_idx`(`lastMessageAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversation_members` (
    `conversationId` VARCHAR(32) NOT NULL,
    `userId` VARCHAR(32) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `conversation_members_userId_idx`(`userId`),
    PRIMARY KEY (`conversationId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `messages` (
    `id` VARCHAR(32) NOT NULL,
    `conversationId` VARCHAR(32) NOT NULL,
    `senderId` VARCHAR(32) NULL,
    `text` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `messages_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message_attachments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `messageId` VARCHAR(32) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(255) NOT NULL DEFAULT '',
    `type` VARCHAR(100) NOT NULL DEFAULT '',
    `url` LONGTEXT NOT NULL,

    INDEX `message_attachments_messageId_idx`(`messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message_reads` (
    `messageId` VARCHAR(32) NOT NULL,
    `userId` VARCHAR(32) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `message_reads_userId_idx`(`userId`),
    PRIMARY KEY (`messageId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wall_posts` (
    `id` VARCHAR(32) NOT NULL,
    `authorId` VARCHAR(32) NOT NULL,
    `text` TEXT NOT NULL,
    `tag` ENUM('birthday', 'anniversary', 'event', 'general', 'poll') NOT NULL DEFAULT 'general',
    `pollQuestion` VARCHAR(500) NULL,
    `pollClosesAt` DATETIME(3) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `wall_posts_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wall_comments` (
    `id` VARCHAR(32) NOT NULL,
    `postId` VARCHAR(32) NOT NULL,
    `authorId` VARCHAR(32) NOT NULL,
    `text` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `wall_comments_postId_idx`(`postId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wall_reactions` (
    `postId` VARCHAR(32) NOT NULL,
    `userId` VARCHAR(32) NOT NULL,
    `type` ENUM('like', 'love', 'celebrate') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `wall_reactions_userId_idx`(`userId`),
    PRIMARY KEY (`postId`, `userId`, `type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wall_poll_options` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `postId` VARCHAR(32) NOT NULL,
    `position` INTEGER NOT NULL,
    `text` VARCHAR(500) NOT NULL,

    UNIQUE INDEX `wall_poll_options_postId_position_key`(`postId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wall_poll_votes` (
    `optionId` INTEGER NOT NULL,
    `userId` VARCHAR(32) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `wall_poll_votes_userId_idx`(`userId`),
    PRIMARY KEY (`optionId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_applications` (
    `id` VARCHAR(32) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL DEFAULT '',
    `phone` VARCHAR(50) NOT NULL,
    `department` VARCHAR(191) NOT NULL,
    `gender` VARCHAR(10) NOT NULL DEFAULT '',
    `experienceYears` DOUBLE NULL,
    `permanentAddress` TEXT NULL,
    `currentAddress` TEXT NULL,
    `resumeUrl` LONGTEXT NOT NULL,
    `resumeName` VARCHAR(255) NOT NULL DEFAULT '',
    `source` ENUM('careers_page', 'referral') NOT NULL DEFAULT 'careers_page',
    `referrerId` VARCHAR(32) NULL,
    `status` ENUM('new', 'reviewed', 'shortlisted', 'rejected', 'hired') NOT NULL DEFAULT 'new',
    `notes` TEXT NULL,
    `referrerComment` TEXT NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `job_applications_referrerId_idx`(`referrerId`),
    INDEX `job_applications_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(32) NOT NULL,
    `actorId` VARCHAR(32) NULL,
    `actorName` VARCHAR(191) NOT NULL DEFAULT 'System',
    `action` ENUM('LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT') NOT NULL,
    `entity` VARCHAR(100) NOT NULL,
    `recordId` VARCHAR(191) NOT NULL DEFAULT '—',
    `ip` VARCHAR(64) NOT NULL DEFAULT '',
    `detail` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `audit_logs_createdAt_idx`(`createdAt`),
    INDEX `audit_logs_entity_idx`(`entity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `id` VARCHAR(32) NOT NULL,
    `singletonKey` VARCHAR(50) NOT NULL DEFAULT 'global',
    `notifications` JSON NOT NULL,
    `integrations` JSON NOT NULL,
    `smtp` JSON NOT NULL,
    `security` JSON NOT NULL,
    `timeTracking` JSON NOT NULL,
    `leavePolicy` JSON NOT NULL,
    `branding` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `settings_singletonKey_key`(`singletonKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_deptId_fkey` FOREIGN KEY (`deptId`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_headId_fkey` FOREIGN KEY (`headId`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_markedById_fkey` FOREIGN KEY (`markedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_correction_requests` ADD CONSTRAINT `attendance_correction_requests_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_correction_requests` ADD CONSTRAINT `attendance_correction_requests_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_comments` ADD CONSTRAINT `leave_comments_leaveRequestId_fkey` FOREIGN KEY (`leaveRequestId`) REFERENCES `leave_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_comments` ADD CONSTRAINT `leave_comments_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `time_logs` ADD CONSTRAINT `time_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_requests` ADD CONSTRAINT `document_requests_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_requests` ADD CONSTRAINT `document_requests_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_requests` ADD CONSTRAINT `document_requests_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rsvps` ADD CONSTRAINT `rsvps_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rsvps` ADD CONSTRAINT `rsvps_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_postedById_fkey` FOREIGN KEY (`postedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_aboutEmployeeId_fkey` FOREIGN KEY (`aboutEmployeeId`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_reads` ADD CONSTRAINT `notification_reads_notificationId_fkey` FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_reads` ADD CONSTRAINT `notification_reads_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_clears` ADD CONSTRAINT `notification_clears_notificationId_fkey` FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_clears` ADD CONSTRAINT `notification_clears_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversation_members` ADD CONSTRAINT `conversation_members_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversation_members` ADD CONSTRAINT `conversation_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_attachments` ADD CONSTRAINT `message_attachments_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `messages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_reads` ADD CONSTRAINT `message_reads_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `messages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_reads` ADD CONSTRAINT `message_reads_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wall_posts` ADD CONSTRAINT `wall_posts_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wall_comments` ADD CONSTRAINT `wall_comments_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `wall_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wall_comments` ADD CONSTRAINT `wall_comments_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wall_reactions` ADD CONSTRAINT `wall_reactions_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `wall_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wall_reactions` ADD CONSTRAINT `wall_reactions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wall_poll_options` ADD CONSTRAINT `wall_poll_options_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `wall_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wall_poll_votes` ADD CONSTRAINT `wall_poll_votes_optionId_fkey` FOREIGN KEY (`optionId`) REFERENCES `wall_poll_options`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wall_poll_votes` ADD CONSTRAINT `wall_poll_votes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_applications` ADD CONSTRAINT `job_applications_referrerId_fkey` FOREIGN KEY (`referrerId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

