# NuGet Package Upgrade

## Strategy
Override the vulnerable transitive package with a direct stable reference in Tampisaw.Web so both solution projects resolve the fixed version.

## Preferences
- **Flow Mode**: Automatic
- **Commit Strategy**: After Each Task
- **Scope**: Entire Tampisaw solution
- **Package**: System.Security.Cryptography.Pkcs
- **Version Policy**: Latest supported stable version
- **Resolved Version**: 10.0.13

## Decisions
- Use an explicit PackageReference in src/Tampisaw.Web/Tampisaw.Web.csproj because the vulnerable package is transitive through Microsoft.Data.SqlClient and is not declared directly.
- Quick assessment found no package API diff because the package is transitive; validate compatibility through restore, build, vulnerability scan, and tests.

## Source Control
- **Source Control**: Git unavailable in the configured PowerShell environment; no branch or commit actions
