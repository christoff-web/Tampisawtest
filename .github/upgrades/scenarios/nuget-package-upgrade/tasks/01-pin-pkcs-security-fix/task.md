# 01-pin-pkcs-security-fix: Pin System.Security.Cryptography.Pkcs to 10.0.13

## Research findings

- Affected project files: `src/Tampisaw.Web/Tampisaw.Web.csproj` and its dependent `tests/Tampisaw.Tests/Tampisaw.Tests.csproj`.
- Both projects target `net10.0` and use standard per-project `PackageReference`; no `Directory.Packages.props` or Central Package Management is present.
- `System.Security.Cryptography.Pkcs` is not directly declared. It is resolved transitively through `Microsoft.Data.SqlClient` 6.1.7 at vulnerable version 9.0.11.
- `dotnet list Tampisaw.sln package --outdated --include-transitive` reports the fixed stable version 10.0.13.
- The solution currently restores with NU1902 and NU1903 warnings for version 9.0.11 in both projects.
- The explicit reference belongs in `Tampisaw.Web`; the test project consumes the web project and will resolve the same dependency version.

## Objective

Add an explicit `PackageReference` for `System.Security.Cryptography.Pkcs` version 10.0.13 to `src/Tampisaw.Web/Tampisaw.Web.csproj`. The package is currently transitive through `Microsoft.Data.SqlClient`; the explicit reference will override vulnerable 9.0.11 resolution while preserving the existing dependency graph. No source API changes are expected because the package is transitive and not directly used by the project.

**Done when**: Restore resolves `System.Security.Cryptography.Pkcs` at 10.0.13 for both projects and no vulnerability warnings remain for this package.
