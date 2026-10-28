# Tampisaw System

Pool, cottage, room and event reservation system for Golden Pyramid Swimming Pool.

| Part | Technology |
|---|---|
| Frontend (your existing UI, unchanged) | HTML, CSS, JavaScript (built from the original React/Tailwind source in `frontend/`) |
| Backend | C# / ASP.NET Core on .NET 10 (`src/Tampisaw.Web`) |
| Database | Microsoft SQL Server (script in `database/`) |

The backend serves the finished UI **and** the API from one app, so there is only one thing to run.

---

## 1. What you need installed

1. **Visual Studio 2026** with the workload **ASP.NET and web development**.
2. For the default database: the **Data storage and processing** workload (it installs *SQL Server Express LocalDB*).
   Or use any SQL Server you already have (see section 4).
3. Node.js is **not needed** to run the app. The UI is already built into `src/Tampisaw.Web/wwwroot`.
   Node.js 20+ is only needed if you want to change the UI source (section 6).

## 2. Open, build, run (simplest path)

1. Open `Tampisaw.sln` in Visual Studio 2026.
2. Wait for NuGet restore to finish (needs internet the first time).
3. In the toolbar choose the **Tampisaw** profile and press **F5** (or Ctrl+F5).
4. The browser opens at `http://localhost:5080`.
   On the first start the app creates the `Tampisaw` database in **Microsoft SQL Server** and the resort configuration by itself.

### First sign-in: the Root Admin

There are **no demo accounts**. On the first start the app creates one **Root Admin**:

* E-mail: `RootAdmin:Email` in `appsettings.json` (default `root@goldenpyramid.ph`).
* Password: `RootAdmin:Password` if you set it (use *Manage User Secrets* or the `RootAdmin__Password` environment variable),
  otherwise a random one-time password is **printed once in the console** at first start. Change it after signing in.
* Forgot the root password? Start the app once with `RootAdmin__ResetPassword=<new password>` set, sign in, then remove it.

The Root Admin has exactly two modules, **Staff Accounts** and **Audit Logs**: it creates, edits, archives, restores and deletes **Admin** and
**Receptionist** accounts and reads the audit log. It cannot open any bookings, guest or payment screens. Nobody else can manage staff accounts and the Root Admin account cannot be deleted, archived or
demoted. Guests sign up themselves from the login page.

Passwords for every account need at least 8 characters, one uppercase letter, one number and one special character.

If you are upgrading a database that already has the old demo accounts (`mika@example.com`, `reception@goldenpyramid.ph`,
`admin@goldenpyramid.ph`), the app warns in the console while they still use the published demo passwords. Sign in as Root Admin and
reset or archive them. Existing data is never deleted automatically.

### Forgot password

Every login page has **Forgot password?**. A 6-digit code (valid 15 minutes, 5 attempts) is e-mailed to the account's address.
Configure a mail server in the `Smtp` section (`Host`, `Port`, `User`, `Password`, `From`; keep `Password` in user-secrets).
With no `Smtp:Host` the code is only written to the server log, which is fine on a local machine but not for real guests.

## 3. Command line alternative

```
dotnet run --project src/Tampisaw.Web
```

## 4. Connecting your own SQL Server

1. *(Optional)* Create an empty database and run `database/Tampisaw.SqlServer.sql` in SSMS.
   If you skip this, the app creates and upgrades the tables itself on first start.
2. Open `src/Tampisaw.Web/appsettings.json` and edit **only** the connection string:

```json
"ConnectionStrings": {
  "Tampisaw": "Server=YOUR_SERVER;Database=Tampisaw;Trusted_Connection=True;TrustServerCertificate=True"
}
```

SQL login instead of Windows login:
`Server=YOUR_SERVER;Database=Tampisaw;User Id=YOUR_USER;Password=YOUR_PASSWORD;TrustServerCertificate=True`

SQL Server is the only supported database. Details: `docs/DATABASE.md`.

> Keep real passwords out of source control: use *Manage User Secrets* (right-click the project) or an environment variable
> `ConnectionStrings__Tampisaw`.

If the database cannot be reached, the app stops at start-up with a message that names the server and tells you to check
`ConnectionStrings:Tampisaw`.

## 5. Running the tests

* **Unit tests:** Visual Studio → *Test* → *Run All Tests* (project `Tampisaw.Tests`, xUnit). They use the in-memory store and need no database.
* **End-to-end API tests** (needs Python 3): `dotnet run --project src/Tampisaw.Web -p:NoDb=true` starts the app with an
  in-memory store (nothing is saved; root login `root@goldenpyramid.ph` / `Root#Pass123`), then
  `python tests/api_smoke_test.py http://localhost:5080`. Never point this test at your real database: it creates bookings and accounts.

## 6. Changing the UI later (optional)

```
cd frontend
npm install
npm run dev      # live UI at http://localhost:5173, talks to the running ASP.NET app on :5080
npm run build    # writes the production files into src/Tampisaw.Web/wwwroot
```

## 7. Folder map

```
Tampisaw.sln
database/   Tampisaw.SqlServer.sql  02_Tampisaw_Queries.sql
docs/       DATABASE.md  FEATURES_AND_TESTS.md
frontend/   your original UI source (React + Tailwind) - only the data layer was changed
src/Tampisaw.Web/
   Api/         HTTP endpoints, role checks, validation, conflict prevention
   Services/    booking rules and operations (AppStore, Ops, ...)
   Models/      data model            Data/   SQL Server persistence + migrations
   wwwroot/     the built UI (HTML/CSS/JS)
tests/      Tampisaw.Tests (xUnit)  api_smoke_test.py
```
