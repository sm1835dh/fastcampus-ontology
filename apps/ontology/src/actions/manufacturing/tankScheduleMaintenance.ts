// tank.scheduleMaintenance — take a tank offline and book the work.
//
// The route has already checked the body against the action's parameter_schema,
// so what is left here is the business rules and the writes. Those params and
// that schema have to stay in step; both live in sql/001_manufacturing.sql.
import type { Selectable, Transaction } from "kysely";
import type { Database, ManufacturingTankTable } from "../../db.ts";
import { ApiError } from "../../ontology/errors.ts";
import { METADATA_SCHEMA } from "../../ontology/schemas.ts";
import { withTransaction } from "../transaction.ts";
import { defineAction, type ActionContext } from "../types.ts";

type TankRow = Selectable<ManufacturingTankTable>;

type ScheduleMaintenanceParams = {
  type: "inspection" | "preventive" | "corrective" | "cleaning";
  /** ISO 8601 datetime, per the action's parameter_schema. */
  plannedAt: string;
  notes: string;
};

/**
 * Log ids read like the ones already in the table: ML-<tank>-<date>. Two visits
 * booked for the same tank on the same day would collide on the primary key, so
 * the second one gets a suffix rather than a 500.
 */
async function nextLogId(trx: Transaction<Database>, tankId: string, plannedAt: Date): Promise<string> {
  // Ids read like the ones already in the table, which drop the tank's own
  // hyphen: T-12 becomes ML-T12-<date>.
  const base = `ML-${tankId.replace(/[^A-Za-z0-9]/g, "")}-${plannedAt.toISOString().slice(0, 10)}`;

  const taken = new Set(
    (
      await trx
        .selectFrom("manufacturing.maintenance_log")
        .select("id")
        .where("id", "like", `${base}%`)
        .execute()
    ).map((row) => row.id),
  );

  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix <= taken.size + 2; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new ApiError(500, `Could not allocate a maintenance log id for ${tankId}.`);
}

async function scheduleMaintenance(
  tank: TankRow,
  params: ScheduleMaintenanceParams,
  context: ActionContext,
): Promise<TankRow> {
  // The schema guarantees a string in date-time shape; it does not guarantee
  // that the string names a real instant.
  const plannedAt = new Date(params.plannedAt);
  if (Number.isNaN(plannedAt.getTime())) {
    throw new ApiError(400, `plannedAt '${params.plannedAt}' is not a valid datetime.`);
  }

  return withTransaction(context.db, async (trx) => {
    // Checked inside the transaction: a batch that starts fermenting between a
    // check outside it and the write would leave the tank offline underneath it.
    const fermenting = await trx
      .selectFrom("manufacturing.batch")
      .select("id")
      .where("assigned_tank_id", "=", tank.id)
      .where("status", "=", "fermenting")
      .execute();

    if (fermenting.length > 0) {
      const ids = fermenting.map((batch) => batch.id).join(", ");
      throw new ApiError(
        409,
        `Tank ${tank.id} cannot be taken offline: ${ids} ${fermenting.length === 1 ? "is" : "are"} still fermenting in it.`,
      );
    }

    const logId = await nextLogId(trx, tank.id, plannedAt);

    await trx
      .insertInto("manufacturing.maintenance_log")
      .values({
        id: logId,
        // target_type holds the object type's api_name: the target is
        // polymorphic and resolves against manufacturing.object_type.
        target_type: context.objectType.api_name,
        target_id: tank.id,
        type: params.type,
        status: "scheduled",
        planned_at: plannedAt,
        notes: params.notes,
      })
      .execute();

    const updated = await trx
      .updateTable("manufacturing.tank")
      .set({ status: "maintenance" })
      .where("id", "=", tank.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    await trx
      .withSchema(METADATA_SCHEMA)
      .insertInto("audit_log")
      .values({
        action_type_id: context.actionType.id,
        action_api_name: context.actionType.api_name,
        target_type_id: context.objectType.id,
        target_type_api_name: context.objectType.api_name,
        target_id: tank.id,
        actor: context.actor,
        params: JSON.stringify(params),
        result: JSON.stringify({
          maintenanceLogId: logId,
          previousStatus: tank.status,
          status: updated.status,
        }),
      })
      .execute();

    return updated;
  });
}

export default defineAction(scheduleMaintenance);
