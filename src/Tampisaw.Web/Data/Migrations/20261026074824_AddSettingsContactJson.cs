using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tampisaw.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSettingsContactJson : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Contact",
                table: "Settings",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Contact",
                table: "Settings");
        }
    }
}
