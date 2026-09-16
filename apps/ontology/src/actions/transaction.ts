import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db.ts";

/**
 * Runs `work` in a transaction, joining one that is already open.
 *
 * Actions used to call `db.transaction()` directly, which was fine while every
 * action was invoked on its own. Approving a proposal broke that: it runs
 * another action inside its own transaction so the two commit or fail together,
 * and Kysely refuses a transaction started on a transaction --
 *
 *   transaction() { throw new Error('calling the transaction method for a
 *                   Transaction is not supported') }
 *
 * `isTransaction` is Kysely's own discriminator (`false` on Kysely, `true` on
 * Transaction), so the check is theirs rather than a guess about the shape.
 *
 * Joining rather than nesting means an inner action cannot commit on its own:
 * its writes land only when the outermost caller commits, which is exactly the
 * atomicity an approval needs.
 */
export function withTransaction<T>(
  db: Kysely<Database>,
  work: (trx: Transaction<Database>) => Promise<T>,
): Promise<T> {
  return db.isTransaction ? work(db as Transaction<Database>) : db.transaction().execute(work);
}
