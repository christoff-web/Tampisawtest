# Microsoft SQL Server database

`Tampisaw.SqlServer.sql` is an idempotent SQL Server script generated from the application's existing EF Core migration. It creates the current relational tables, indexes, and `__EFMigrationsHistory` table. Nested application values remain in JSON text columns (`nvarchar(max)`) as required by the current design.

## Create the database

1. Create an empty database in Microsoft SQL Server.
2. Open `Tampisaw.SqlServer.sql` in SQL Server Management Studio or Azure Data Studio.
3. Select the new database and execute the script.
4. Configure the application to use that database.

The script creates the schema only. When the application starts against an empty database, its existing persistence layer applies migrations and seeds the baseline resort configuration (no demo accounts or demo history); the Root Admin account is created on first start. Do not run the script against a database containing unrelated tables without reviewing it first.

## Configure the application

The provider is already SQL Server. Set the `ConnectionStrings:Tampisaw` value using a deployment-specific configuration source rather than committing credentials:

```text
Server=YOUR_SERVER;Database=Tampisaw;Trusted_Connection=True;TrustServerCertificate=True
```

For SQL authentication, use a secret-managed value such as:

```text
Server=YOUR_SERVER;Database=Tampisaw;User Id=YOUR_USER;Password=YOUR_PASSWORD;TrustServerCertificate=True
```

For local development, use .NET user secrets or an environment variable:

```powershell
dotnet user-secrets init --project src/Tampisaw.Web
dotnet user-secrets set "ConnectionStrings:Tampisaw" "Server=YOUR_SERVER;Database=Tampisaw;Trusted_Connection=True;TrustServerCertificate=True" --project src/Tampisaw.Web
```

Do not delete the existing LocalDB database until the replacement database has been verified and any required data migration or backup has been completed.
