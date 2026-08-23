import { customType } from "drizzle-orm/pg-core";

/**
 * A jsonb column that stores a real JSON OBJECT, not a JSON-encoded string.
 *
 * drizzle-orm's built-in `jsonb()` runs JSON.stringify in mapToDriverValue, and
 * the postgres.js driver then encodes that string as a JSON value in its own
 * right. The result round-trips through the ORM and looks perfectly healthy —
 * but in the database the column holds `"{\"paragraph\":\"§ 19\"}"` rather than
 * `{"paragraph": "§ 19"}`, so every SQL-level JSON operator silently fails:
 *
 *   provenance ? 'paragraph'        -> false
 *   provenance->>'paragraph'        -> null
 *
 * That is the dangerous shape of bug for this project. Application reads keep
 * working, so nothing looks broken, while any SQL filter or index over
 * provenance quietly matches nothing — including "show me only real statutes"
 * and any future partial index.
 *
 * postgres.js serialises a plain object to jsonb correctly on its own, so the
 * fix is simply to stop stringifying it first.
 */
export const jsonbObject = <T>(name: string) =>
  customType<{ data: T; driverData: T }>({
    dataType() {
      return "jsonb";
    },
    toDriver(value: T): T {
      return value;
    },
    fromDriver(value: T): T {
      return value;
    },
  })(name);
