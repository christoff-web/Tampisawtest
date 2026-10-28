# NuGet Package Upgrade Plan

## Overview

**Target**: Remove the vulnerable transitive `System.Security.Cryptography.Pkcs` 9.0.11 dependency.
**Scope**: Two .NET 10 projects in the Tampisaw solution, using a direct package override in the web project so the solution resolves version 10.0.13 consistently.

## Tasks

### 01-pin-pkcs-security-fix: Pin System.Security.Cryptography.Pkcs to 10.0.13

Add an explicit `PackageReference` for `System.Security.Cryptography.Pkcs` version 10.0.13 to `src/Tampisaw.Web/Tampisaw.Web.csproj`. The package is currently transitive through `Microsoft.Data.SqlClient` and is not declared in either project file; the explicit reference will override the vulnerable 9.0.11 resolution while preserving the existing dependency graph. No source API changes are expected for the application because the package is transitive and not directly used by the project.

**Done when**: Restore resolves `System.Security.Cryptography.Pkcs` at 10.0.13 for both projects and no vulnerability warnings remain for this package.

---

### 02-validate-solution: Build and test the solution

Restore and build the solution, verify the vulnerable package no longer appears in the vulnerability report, and run the available test suite. Treat new compiler or restore warnings as failures requiring resolution.

**Done when**: The solution builds without errors or warnings attributable to this upgrade, tests pass, and `dotnet list package --vulnerable --include-transitive` no longer reports `System.Security.Cryptography.Pkcs` 9.0.11.
