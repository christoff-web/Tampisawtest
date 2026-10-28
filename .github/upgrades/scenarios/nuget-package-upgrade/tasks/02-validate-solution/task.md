# 02-validate-solution: Build and test the solution

## Research findings

- Both projects are SDK-style and target only `net10.0`, so `dotnet build` and `dotnet test` are the appropriate validation tools.
- The solution build after the package override succeeded with zero errors and zero warnings.
- Vulnerability verification reports no vulnerable packages for either `Tampisaw.Web` or `Tampisaw.Tests`.
- The test host currently aborts before running tests because `Azure.Core` 1.50.0 is listed in `Tampisaw.Tests.deps.json` but `lib/net8.0/Azure.Core.dll` is absent from the local package/output assets. This is unrelated to `System.Security.Cryptography.Pkcs`; retry with a clean restore/output if possible, otherwise document it as an environment/dependency-cache blocker.

## Objective

Restore and build the solution, verify the vulnerable package no longer appears in the vulnerability report, and run the available test suite. Treat new compiler or restore warnings as failures requiring resolution.

**Done when**: The solution builds without errors or warnings attributable to this upgrade, tests pass, and `dotnet list package --vulnerable --include-transitive` no longer reports `System.Security.Cryptography.Pkcs` 9.0.11.
