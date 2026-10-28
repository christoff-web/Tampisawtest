using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tampisaw.Data.Migrations
{
    /// <summary>
    /// Booking archive (soft delete) and the guest's partial/full payment choice.
    /// Written by hand to match the model snapshot; the same changes are in database/Tampisaw.SqlServer.sql.
    /// </summary>
    [DbContext(typeof(TampisawDbContext))]
    [Migration("20261025090000_BookingArchiveAndPaymentOption")]
    public partial class BookingArchiveAndPaymentOption : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(name: "Archived", table: "Bookings", type: "bit", nullable: false, defaultValue: false);
            migrationBuilder.AddColumn<string>(name: "ArchivedAt", table: "Bookings", type: "nvarchar(max)", nullable: true);
            migrationBuilder.AddColumn<string>(name: "ArchivedBy", table: "Bookings", type: "nvarchar(max)", nullable: true);
            migrationBuilder.AddColumn<string>(name: "PaymentOption", table: "Bookings", type: "nvarchar(max)", nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "PaymentOption", table: "Bookings");
            migrationBuilder.DropColumn(name: "ArchivedBy", table: "Bookings");
            migrationBuilder.DropColumn(name: "ArchivedAt", table: "Bookings");
            migrationBuilder.DropColumn(name: "Archived", table: "Bookings");
        }
    }
}
