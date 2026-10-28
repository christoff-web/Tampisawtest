IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Addons] (
        [Id] nvarchar(100) NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [Description] nvarchar(max) NOT NULL,
        [Price] int NOT NULL,
        [Unit] nvarchar(max) NOT NULL,
        [DailyCap] int NOT NULL,
        [Deposit] int NOT NULL,
        [Image] nvarchar(max) NOT NULL,
        [Active] bit NOT NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_Addons] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [AuditLog] (
        [Id] nvarchar(100) NOT NULL,
        [At] nvarchar(max) NOT NULL,
        [Actor] nvarchar(max) NOT NULL,
        [Action] nvarchar(max) NOT NULL,
        [BookingId] nvarchar(100) NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_AuditLog] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Blackouts] (
        [Id] nvarchar(100) NOT NULL,
        [Date] nvarchar(10) NOT NULL,
        [SlotId] nvarchar(max) NULL,
        [Reason] nvarchar(max) NOT NULL,
        [Kind] nvarchar(max) NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_Blackouts] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Bookings] (
        [Id] nvarchar(100) NOT NULL,
        [GuestId] nvarchar(100) NOT NULL,
        [GuestName] nvarchar(max) NOT NULL,
        [Email] nvarchar(max) NOT NULL,
        [Date] nvarchar(10) NOT NULL,
        [SlotId] nvarchar(64) NOT NULL,
        [Guests] int NOT NULL,
        [Type] nvarchar(max) NOT NULL,
        [CottageId] nvarchar(100) NULL,
        [CottageHours] int NULL,
        [Status] nvarchar(32) NOT NULL,
        [Risk] nvarchar(max) NOT NULL,
        [Paid] int NOT NULL,
        [Total] int NOT NULL,
        [CheckedInAt] nvarchar(max) NULL,
        [Phone] nvarchar(max) NULL,
        [Adults] int NULL,
        [Children] int NULL,
        [Discounts] int NULL,
        [PaymentStatus] nvarchar(max) NOT NULL,
        [StaffApproval] nvarchar(max) NULL,
        [PaymentMethod] nvarchar(max) NULL,
        [ArrivalDate] nvarchar(max) NULL,
        [ArrivalTime] nvarchar(max) NULL,
        [ProofName] nvarchar(max) NULL,
        [ProofImage] nvarchar(max) NULL,
        [BalanceProof] nvarchar(max) NULL,
        [BalanceMethod] nvarchar(max) NULL,
        [PaymentDeadline] nvarchar(max) NULL,
        [Source] nvarchar(max) NULL,
        [EventStart] nvarchar(max) NULL,
        [CreatedAt] nvarchar(max) NULL,
        [DueNow] int NULL,
        [Receipt] nvarchar(max) NULL,
        [AttendanceConfirmed] bit NOT NULL,
        [ReminderSentAt] nvarchar(max) NULL,
        [DayBeforeReminderAt] nvarchar(max) NULL,
        [WarnedAt] nvarchar(max) NULL,
        [CancelRequestedAt] nvarchar(max) NULL,
        [TimeIn] nvarchar(max) NULL,
        [TimeOut] nvarchar(max) NULL,
        [BraceletReturned] bit NULL,
        [Bracelets] nvarchar(max) NOT NULL,
        [WalkInOption] nvarchar(max) NULL,
        [Mix] nvarchar(max) NULL,
        [Addons] nvarchar(max) NOT NULL,
        [AddonDeposit] int NULL,
        [Waiver] nvarchar(max) NULL,
        [QrToken] nvarchar(max) NULL,
        [CheckedInAtISO] nvarchar(max) NULL,
        [SessionMinutes] int NULL,
        [ExpiryAlertSentAt] nvarchar(max) NULL,
        [Overtime] nvarchar(max) NULL,
        [CancelReason] nvarchar(max) NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_Bookings] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [BraceletLog] (
        [Id] nvarchar(100) NOT NULL,
        [At] nvarchar(max) NOT NULL,
        [BookingId] nvarchar(100) NULL,
        [Kind] nvarchar(max) NOT NULL,
        [Detail] nvarchar(max) NOT NULL,
        [By] nvarchar(max) NOT NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_BraceletLog] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Cottages] (
        [Id] nvarchar(100) NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [Capacity] int NOT NULL,
        [Price] int NOT NULL,
        [Status] nvarchar(max) NOT NULL,
        [Image] nvarchar(max) NOT NULL,
        [Amenities] nvarchar(max) NOT NULL,
        [Kind] nvarchar(max) NOT NULL,
        [Units] int NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_Cottages] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Draft] (
        [Id] int NOT NULL,
        [Date] nvarchar(max) NOT NULL,
        [SlotId] nvarchar(max) NOT NULL,
        [Guests] int NOT NULL,
        [Type] nvarchar(max) NOT NULL,
        [CottageId] nvarchar(max) NULL,
        [CottageHours] int NULL,
        [Name] nvarchar(max) NOT NULL,
        [Email] nvarchar(max) NOT NULL,
        [Phone] nvarchar(max) NOT NULL,
        [Adults] int NOT NULL,
        [Children] int NOT NULL,
        [Discounts] int NOT NULL,
        [EventStart] nvarchar(max) NULL,
        [Mix] nvarchar(max) NULL,
        [Addons] nvarchar(max) NULL,
        [Waiver] nvarchar(max) NULL,
        CONSTRAINT [PK_Draft] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Guests] (
        [Id] nvarchar(100) NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [Email] nvarchar(256) NOT NULL,
        [Phone] nvarchar(max) NOT NULL,
        [Visits] int NOT NULL,
        [Cancellations] int NOT NULL,
        [NoShows] int NOT NULL,
        [DamageFees] nvarchar(max) NOT NULL,
        [LastVisit] nvarchar(max) NOT NULL,
        [Risk] nvarchar(max) NOT NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_Guests] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Holds] (
        [Id] nvarchar(100) NOT NULL,
        [Date] nvarchar(10) NOT NULL,
        [SlotId] nvarchar(64) NOT NULL,
        [Guests] int NOT NULL,
        [CottageId] nvarchar(max) NULL,
        [ExpiresAt] nvarchar(max) NOT NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_Holds] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Incidents] (
        [Id] nvarchar(100) NOT NULL,
        [GuestId] nvarchar(100) NULL,
        [GuestName] nvarchar(max) NOT NULL,
        [BookingId] nvarchar(100) NULL,
        [Type] nvarchar(max) NOT NULL,
        [Location] nvarchar(max) NOT NULL,
        [Description] nvarchar(max) NOT NULL,
        [Status] nvarchar(max) NOT NULL,
        [Serious] bit NOT NULL,
        [Escalated] bit NOT NULL,
        [GuestConfirmed] bit NOT NULL,
        [AdminReview] nvarchar(max) NULL,
        [Source] nvarchar(max) NOT NULL,
        [CreatedAt] nvarchar(max) NOT NULL,
        [ResolvedAt] nvarchar(max) NULL,
        [Notes] nvarchar(max) NOT NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_Incidents] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Lifeguards] (
        [Id] nvarchar(100) NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [Active] bit NOT NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_Lifeguards] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Maintenance] (
        [Id] nvarchar(100) NOT NULL,
        [GuestId] nvarchar(100) NULL,
        [GuestName] nvarchar(max) NOT NULL,
        [BookingId] nvarchar(100) NULL,
        [Area] nvarchar(max) NOT NULL,
        [Concern] nvarchar(max) NOT NULL,
        [Details] nvarchar(max) NOT NULL,
        [Urgent] bit NOT NULL,
        [Status] nvarchar(max) NOT NULL,
        [Escalated] bit NOT NULL,
        [AssignedTo] nvarchar(max) NULL,
        [GuestConfirmed] bit NOT NULL,
        [AdminReview] nvarchar(max) NULL,
        [CreatedAt] nvarchar(max) NOT NULL,
        [ResolvedAt] nvarchar(max) NULL,
        [Notes] nvarchar(max) NOT NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_Maintenance] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Notices] (
        [Id] nvarchar(100) NOT NULL,
        [At] nvarchar(max) NOT NULL,
        [Audience] nvarchar(32) NOT NULL,
        [GuestId] nvarchar(100) NULL,
        [BookingId] nvarchar(100) NULL,
        [Message] nvarchar(max) NOT NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_Notices] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [OpsConfig] (
        [Id] int NOT NULL,
        [GuestsPerLifeguard] int NOT NULL,
        [MinLifeguardsPerShift] int NOT NULL,
        CONSTRAINT [PK_OpsConfig] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Policies] (
        [Id] nvarchar(100) NOT NULL,
        [Title] nvarchar(max) NOT NULL,
        [Body] nvarchar(max) NOT NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_Policies] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [PoolLogs] (
        [Id] nvarchar(100) NOT NULL,
        [At] nvarchar(max) NOT NULL,
        [Ph] float NOT NULL,
        [Chlorine] float NOT NULL,
        [Backwash] bit NOT NULL,
        [Cleaned] bit NOT NULL,
        [Notes] nvarchar(max) NOT NULL,
        [By] nvarchar(max) NOT NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_PoolLogs] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Refunds] (
        [Id] nvarchar(100) NOT NULL,
        [At] nvarchar(max) NOT NULL,
        [BookingId] nvarchar(100) NOT NULL,
        [GuestName] nvarchar(max) NOT NULL,
        [Kind] nvarchar(max) NOT NULL,
        [Amount] int NOT NULL,
        [Reason] nvarchar(max) NOT NULL,
        [By] nvarchar(max) NOT NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_Refunds] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Roster] (
        [Id] nvarchar(100) NOT NULL,
        [Date] nvarchar(10) NOT NULL,
        [Shift] nvarchar(max) NOT NULL,
        [GuardId] nvarchar(max) NOT NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_Roster] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [ScanHistory] (
        [Id] nvarchar(100) NOT NULL,
        [Line] nvarchar(max) NOT NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_ScanHistory] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Settings] (
        [Id] int NOT NULL,
        [PeakSeason] bit NOT NULL,
        [Hold] nvarchar(max) NOT NULL,
        [OnlinePaymentMinutes] int NOT NULL,
        [ConfirmationHours] int NOT NULL,
        [CancellationHours] int NOT NULL,
        [DownpaymentPct] int NOT NULL,
        [RiskRules] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_Settings] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [ShiftReports] (
        [Id] nvarchar(100) NOT NULL,
        [ClosedAt] nvarchar(max) NOT NULL,
        [By] nvarchar(256) NOT NULL,
        [OpeningFloat] int NOT NULL,
        [ExpectedCash] int NOT NULL,
        [CountedCash] int NOT NULL,
        [Variance] int NOT NULL,
        [Denominations] nvarchar(max) NOT NULL,
        [Note] nvarchar(max) NOT NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_ShiftReports] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Slots] (
        [Id] nvarchar(100) NOT NULL,
        [Label] nvarchar(max) NOT NULL,
        [Time] nvarchar(max) NOT NULL,
        [Capacity] int NOT NULL,
        [Active] bit NOT NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_Slots] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Staff] (
        [Id] nvarchar(100) NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [Role] nvarchar(max) NOT NULL,
        [Active] bit NOT NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_Staff] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [SyncQueue] (
        [Id] nvarchar(100) NOT NULL,
        [BookingId] nvarchar(100) NOT NULL,
        [GuestName] nvarchar(max) NOT NULL,
        [Kind] nvarchar(max) NOT NULL,
        [At] nvarchar(max) NOT NULL,
        [By] nvarchar(max) NOT NULL,
        [SyncedAt] nvarchar(max) NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_SyncQueue] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Tariff] (
        [Id] int NOT NULL,
        [Rates] nvarchar(max) NOT NULL,
        [StatutoryDiscountPct] int NOT NULL,
        [Overtime] nvarchar(max) NOT NULL,
        [DurationCapHours] nvarchar(max) NOT NULL,
        [ExpiryAlertMinutes] int NOT NULL,
        CONSTRAINT [PK_Tariff] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Users] (
        [Id] nvarchar(100) NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [Email] nvarchar(256) NOT NULL,
        [Phone] nvarchar(max) NOT NULL,
        [PasswordHash] nvarchar(max) NOT NULL,
        [Role] nvarchar(32) NOT NULL,
        [GuestId] nvarchar(450) NULL,
        [Birthdate] nvarchar(max) NULL,
        [FaceImage] nvarchar(max) NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_Users] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE TABLE [Waitlist] (
        [Id] nvarchar(100) NOT NULL,
        [GuestId] nvarchar(100) NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [Phone] nvarchar(max) NOT NULL,
        [Date] nvarchar(10) NOT NULL,
        [SlotId] nvarchar(64) NOT NULL,
        [CottageId] nvarchar(max) NULL,
        [Guests] int NOT NULL,
        [CreatedAt] nvarchar(max) NOT NULL,
        [Status] nvarchar(max) NOT NULL,
        [NotifiedAt] nvarchar(max) NULL,
        [ExpiresAt] nvarchar(max) NULL,
        [Seq] bigint NOT NULL,
        CONSTRAINT [PK_Waitlist] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AuditLog_BookingId] ON [AuditLog] ([BookingId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Blackouts_Date] ON [Blackouts] ([Date]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Bookings_Date_SlotId] ON [Bookings] ([Date], [SlotId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Bookings_GuestId] ON [Bookings] ([GuestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Bookings_Status] ON [Bookings] ([Status]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_BraceletLog_BookingId] ON [BraceletLog] ([BookingId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_Guests_Email] ON [Guests] ([Email]) WHERE [Email] <> ''''');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Holds_Date_SlotId] ON [Holds] ([Date], [SlotId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Incidents_BookingId] ON [Incidents] ([BookingId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Incidents_GuestId] ON [Incidents] ([GuestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Maintenance_GuestId] ON [Maintenance] ([GuestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Notices_Audience_GuestId] ON [Notices] ([Audience], [GuestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Notices_BookingId] ON [Notices] ([BookingId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Refunds_BookingId] ON [Refunds] ([BookingId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Roster_Date] ON [Roster] ([Date]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_ShiftReports_By] ON [ShiftReports] ([By]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_SyncQueue_BookingId] ON [SyncQueue] ([BookingId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Users_Email] ON [Users] ([Email]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Users_GuestId] ON [Users] ([GuestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Waitlist_Date_SlotId] ON [Waitlist] ([Date], [SlotId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Waitlist_GuestId] ON [Waitlist] ([GuestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019125201_InitialCreate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261019125201_InitialCreate', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261024090000_RootAdminAndAccountSecurity'
)
BEGIN
    -- Root admin / account management, pavilion availability, and removal of the selfie photo.
    DECLARE @var sysname;
    SELECT @var = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[Users]') AND [c].[name] = N'FaceImage');
    IF @var IS NOT NULL EXEC(N'ALTER TABLE [Users] DROP CONSTRAINT [' + @var + '];');
    IF COL_LENGTH(N'Users', N'FaceImage') IS NOT NULL ALTER TABLE [Users] DROP COLUMN [FaceImage];

    ALTER TABLE [Users] ADD [Archived] bit NOT NULL DEFAULT CAST(0 AS bit);
    ALTER TABLE [Users] ADD [CreatedAt] nvarchar(max) NULL;
    ALTER TABLE [Users] ADD [CreatedBy] nvarchar(max) NULL;
    ALTER TABLE [AuditLog] ADD [Role] nvarchar(max) NULL;
    ALTER TABLE [Holds] ADD [EventStart] nvarchar(max) NULL;
    ALTER TABLE [Holds] ADD [GuestId] nvarchar(max) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261024090000_RootAdminAndAccountSecurity'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261024090000_RootAdminAndAccountSecurity', N'10.0.13');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261025090000_BookingArchiveAndPaymentOption'
)
BEGIN
    -- Booking archive (soft delete) and partial/full payment choice.
    ALTER TABLE [Bookings] ADD [Archived] bit NOT NULL DEFAULT CAST(0 AS bit);
    ALTER TABLE [Bookings] ADD [ArchivedAt] nvarchar(max) NULL;
    ALTER TABLE [Bookings] ADD [ArchivedBy] nvarchar(max) NULL;
    ALTER TABLE [Bookings] ADD [PaymentOption] nvarchar(max) NULL;
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261025090000_BookingArchiveAndPaymentOption', N'10.0.13');
END;
GO

COMMIT;
GO
