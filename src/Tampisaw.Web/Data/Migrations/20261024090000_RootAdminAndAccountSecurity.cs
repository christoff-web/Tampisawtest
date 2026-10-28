using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tampisaw.Data.Migrations
{
    /// <summary>
    /// Root admin and account management (Users.Archived/CreatedAt/CreatedBy, AuditLog.Role), pavilion availability
    /// (Holds.EventStart/GuestId) and removal of the selfie photo (Users.FaceImage).
    /// Written by hand to match the model snapshot; the same changes are in database/Tampisaw.SqlServer.sql.
    /// </summary>
    [DbContext(typeof(TampisawDbContext))]
    [Migration("20261024090000_RootAdminAndAccountSecurity")]
    public partial class RootAdminAndAccountSecurity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "FaceImage", table: "Users");

            migrationBuilder.AddColumn<bool>(name: "Archived", table: "Users", type: "bit", nullable: false, defaultValue: false);
            migrationBuilder.AddColumn<string>(name: "CreatedAt", table: "Users", type: "nvarchar(max)", nullable: true);
            migrationBuilder.AddColumn<string>(name: "CreatedBy", table: "Users", type: "nvarchar(max)", nullable: true);

            migrationBuilder.AddColumn<string>(name: "Role", table: "AuditLog", type: "nvarchar(max)", nullable: true);

            migrationBuilder.AddColumn<string>(name: "EventStart", table: "Holds", type: "nvarchar(max)", nullable: true);
            migrationBuilder.AddColumn<string>(name: "GuestId", table: "Holds", type: "nvarchar(max)", nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "GuestId", table: "Holds");
            migrationBuilder.DropColumn(name: "EventStart", table: "Holds");
            migrationBuilder.DropColumn(name: "Role", table: "AuditLog");
            migrationBuilder.DropColumn(name: "CreatedBy", table: "Users");
            migrationBuilder.DropColumn(name: "CreatedAt", table: "Users");
            migrationBuilder.DropColumn(name: "Archived", table: "Users");
            migrationBuilder.AddColumn<string>(name: "FaceImage", table: "Users", type: "nvarchar(max)", nullable: true);
        }
    }
}
