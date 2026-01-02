import { db } from "@acme/db/client";

async function testConnection() {
  console.log("Testing database connection...");
  console.log("POSTGRES_URL exists:", !!process.env.POSTGRES_URL);
  console.log(
    "POSTGRES_URL preview:",
    process.env.POSTGRES_URL
      ? `${process.env.POSTGRES_URL.substring(0, 20)}...`
      : "NOT SET",
  );

  try {
    console.log("\n1. Testing simple query...");
    let result = await db.execute("SELECT 1 as test");
    console.log("✓ Simple query succeeded:", result);

    console.log("\n2. Test updating row id 1");
    result = await db.execute(
      "UPDATE whisky SET category = 'Single Malt' WHERE id = 1",
    );
    console.log("✓ Update query succeeded:", result);

    console.log("\n✅ All database operations succeeded!");
  } catch (error) {
    console.error("\n❌ Database operation failed:");
    console.error("Error type:", error?.constructor?.name);
    console.error(
      "Error message:",
      error instanceof Error ? error.message : String(error),
    );
    if (error && typeof error === "object" && "cause" in error) {
      console.error("Error cause:", error.cause);
    }
    if (error && typeof error === "object" && "code" in error) {
      console.error("Error code:", error.code);
    }
    console.error("Full error:", error);
    process.exit(1);
  }
}

void testConnection();
