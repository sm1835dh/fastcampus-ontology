-- Creates the `manufacturing` schema: eight instance tables holding the brewery's
-- real data, plus the metadata tables that describe those types to the ontology API.
--
--   pnpm run-sql sql/001_manufacturing.sql
--
-- Instance data is the course's foundation seed, adapted to the conventions
-- used here: camelCase object api_names, `required` mirroring each column's
-- NOT NULL, and sugar levels stored as specific gravity.
--
-- Re-running drops the schema and everything in it. That is deliberate while the
-- shape is still moving; once real data lands, follow-up changes get their own file.

drop schema if exists manufacturing cascade;
create schema manufacturing;

-- ---------------------------------------------------------------------------
-- Instance tables
--
-- Primary keys are text and hold the domain IDs people actually say out loud
-- (T-12, REC-LAGER-V3, B-2105). Foreign keys between instance tables reference
-- those same text keys.
-- ---------------------------------------------------------------------------

create table manufacturing.operator (
  id             text primary key,
  name           text not null,
  certifications text[] not null default '{}',
  shift          text
);

create table manufacturing.tank (
  id                  text primary key,
  name                text not null,
  -- Working volume in hectolitres.
  capacity            integer,
  status              text not null,
  current_temperature numeric(5, 2),
  commissioned_at     timestamptz
);

create table manufacturing.line (
  id              text primary key,
  name            text not null,
  status          text not null,
  commissioned_at timestamptz
);

create table manufacturing.recipe (
  id                   text primary key,
  name                 text not null,
  -- Target specific gravity at each checkpoint: {"day_1": 1.050, "day_4": 1.035, ...}
  target_sugar_curve   jsonb,
  fermentation_days    integer,
  required_ingredients text[] not null default '{}',
  notes                text
);

create table manufacturing.batch (
  id                   text primary key,
  recipe_id            text not null references manufacturing.recipe (id),
  target_volume        integer,
  status               text not null,
  planned_start        timestamptz,
  -- Specific gravity, so three decimals: 1.022 must not round to 1.02.
  current_sugar_level  numeric(6, 3),
  current_temperature  numeric(5, 2),
  days_fermenting      integer,
  -- A batch can sit unassigned between tanks, so both assignments are nullable.
  assigned_tank_id     text references manufacturing.tank (id),
  assigned_operator_id text references manufacturing.operator (id),
  last_operator_note   text
);

create table manufacturing.bottling_run (
  id                   text primary key,
  batch_id             text not null references manufacturing.batch (id),
  line_id              text not null references manufacturing.line (id),
  planned_start        timestamptz,
  status               text not null,
  assigned_operator_id text references manufacturing.operator (id)
);

create table manufacturing.quality_test (
  id          text primary key,
  batch_id    text not null references manufacturing.batch (id),
  test_date   timestamptz not null,
  ph          numeric(4, 2),
  sugar_level numeric(6, 3),
  notes       text,
  tested_by   text
);

create table manufacturing.maintenance_log (
  id           text primary key,
  -- Polymorphic target: target_type names the object type ('tank', 'line') and
  -- target_id holds its domain ID. No FK constraint can span both tables, and
  -- no link row can express it either -- the API resolves it in code.
  target_type  text not null,
  target_id    text not null,
  type         text not null,
  status       text not null,
  -- When the work is meant to happen. A scheduled log has this and no start.
  planned_at   timestamptz,
  started_at   timestamptz,
  completed_at timestamptz,
  notes        text
);

create index on manufacturing.batch (recipe_id);
create index on manufacturing.batch (assigned_tank_id);
create index on manufacturing.batch (assigned_operator_id);
create index on manufacturing.bottling_run (batch_id);
create index on manufacturing.bottling_run (line_id);
create index on manufacturing.quality_test (batch_id);
create index on manufacturing.maintenance_log (target_type, target_id);

-- ---------------------------------------------------------------------------
-- Metadata tables
--
-- Every metadata row carries three identifiers:
--   id       generated UUID, the only thing FKs point at
--   api_name stable, code-facing, never edited once published
--   name     display label, freely editable
-- ---------------------------------------------------------------------------

create table manufacturing.object_type (
  id               uuid primary key default gen_random_uuid(),
  api_name         text not null unique,
  name             text not null,
  description      text,
  status           text not null default 'active',
  visibility       text not null default 'normal',
  point_of_contact text,
  edits_enabled    boolean not null default true,
  -- Where the instance rows live.
  schema           text not null,
  datasource_table text not null
);

create table manufacturing.property (
  id                uuid primary key default gen_random_uuid(),
  object_type_id    uuid not null references manufacturing.object_type (id) on delete cascade,
  api_name          text not null,
  name              text not null,
  data_type         text not null,
  -- Mirrors the NOT NULL on datasource_column, so the metadata cannot promise
  -- something the table does not enforce.
  required          boolean not null default false,
  is_title          boolean not null default false,
  is_primary_key    boolean not null default false,
  datasource_column text not null,
  -- api_name is unique within its object type, not globally: Tank and Line both
  -- have a `name` property.
  unique (object_type_id, api_name)
);

create table manufacturing.link (
  id               uuid primary key default gen_random_uuid(),
  api_name         text not null,
  name             text not null,
  -- How the link reads from the target side (tank.assignedBatches).
  inverse_api_name text not null,
  inverse_name     text not null,
  source_type_id   uuid not null references manufacturing.object_type (id) on delete cascade,
  target_type_id   uuid not null references manufacturing.object_type (id) on delete cascade,
  -- The foreign-key property on the source that carries the link.
  via_property_id  uuid not null references manufacturing.property (id) on delete cascade,
  cardinality      text not null check (
    cardinality in ('one_to_one', 'one_to_many', 'many_to_one', 'many_to_many')
  ),
  unique (source_type_id, api_name),
  unique (target_type_id, inverse_api_name)
);

create table manufacturing.action_type (
  id               uuid primary key default gen_random_uuid(),
  object_type_id   uuid not null references manufacturing.object_type (id) on delete cascade,
  api_name         text not null,
  name             text not null,
  description      text,
  -- JSON Schema validated at call time against the submitted parameters.
  parameter_schema jsonb not null,
  unique (object_type_id, api_name)
);

create table manufacturing.audit_log (
  id                   uuid primary key default gen_random_uuid(),
  -- The metadata rows are nullable and paired with a snapshot of their api_name,
  -- so the trail survives an action or object type being deleted later.
  action_type_id       uuid references manufacturing.action_type (id) on delete set null,
  action_api_name      text not null,
  target_type_id       uuid references manufacturing.object_type (id) on delete set null,
  target_type_api_name text not null,
  -- Domain ID of the instance row the action ran against (B-2105).
  target_id            text not null,
  actor                text,
  params               jsonb,
  result               jsonb,
  created_at           timestamptz not null default now()
);

create index on manufacturing.property (object_type_id);
create index on manufacturing.link (source_type_id);
create index on manufacturing.link (target_type_id);
create index on manufacturing.action_type (object_type_id);
create index on manufacturing.audit_log (target_type_api_name, target_id);
create index on manufacturing.audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Metadata for the eight manufacturing types
-- ---------------------------------------------------------------------------

insert into manufacturing.object_type
  (api_name, name, description, status, visibility, point_of_contact, edits_enabled, schema, datasource_table)
values
  ('tank', 'Tank', 'Fermentation and conditioning vessels.',
   'active', 'prominent', 'brewing-ops@example.com', true, 'manufacturing', 'tank'),
  ('line', 'Line', 'Bottling and packaging lines.',
   'active', 'normal', 'packaging@example.com', true, 'manufacturing', 'line'),
  ('batch', 'Batch', 'A volume of beer going through production.',
   'active', 'prominent', 'brewing-ops@example.com', true, 'manufacturing', 'batch'),
  ('bottlingRun', 'Bottling Run', 'A packaging run on a bottling line.',
   'active', 'normal', 'packaging@example.com', true, 'manufacturing', 'bottling_run'),
  ('maintenanceLog', 'Maintenance Log', 'A service event on a tank or a line.',
   'active', 'normal', 'maintenance@example.com', true, 'manufacturing', 'maintenance_log'),
  ('operator', 'Operator', 'A brewery floor operator.',
   'active', 'normal', 'people-ops@example.com', true, 'manufacturing', 'operator'),
  ('recipe', 'Recipe', 'A fermentation recipe with targets and notes.',
   'active', 'prominent', 'brewing-ops@example.com', true, 'manufacturing', 'recipe'),
  ('qualityTest', 'Quality Test', 'Lab test results for a batch.',
   'active', 'normal', 'quality@example.com', true, 'manufacturing', 'quality_test');

-- Property api_names are camelCase; datasource_column is the snake_case column
-- it reads from. Types with no name column use their domain ID as the title.
insert into manufacturing.property
  (object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column)
select ot.id, p.api_name, p.name, p.data_type, p.required, p.is_title, p.is_primary_key, p.datasource_column
from (values
  -- Tank
  ('tank', 'id', 'ID', 'string', true, false, true, 'id'),
  ('tank', 'name', 'Name', 'string', true, true, false, 'name'),
  ('tank', 'capacity', 'Capacity (hL)', 'integer', false, false, false, 'capacity'),
  ('tank', 'status', 'Status', 'string', true, false, false, 'status'),
  ('tank', 'currentTemperature', 'Current Temperature (°C)', 'double', false, false, false, 'current_temperature'),
  ('tank', 'commissionedAt', 'Commissioned', 'timestamp', false, false, false, 'commissioned_at'),
  -- Line
  ('line', 'id', 'ID', 'string', true, false, true, 'id'),
  ('line', 'name', 'Name', 'string', true, true, false, 'name'),
  ('line', 'status', 'Status', 'string', true, false, false, 'status'),
  ('line', 'commissionedAt', 'Commissioned', 'timestamp', false, false, false, 'commissioned_at'),
  -- Batch
  ('batch', 'id', 'Batch ID', 'string', true, true, true, 'id'),
  ('batch', 'recipeId', 'Recipe ID', 'string', true, false, false, 'recipe_id'),
  ('batch', 'targetVolume', 'Target Volume (hL)', 'integer', false, false, false, 'target_volume'),
  ('batch', 'status', 'Status', 'string', true, false, false, 'status'),
  ('batch', 'plannedStart', 'Planned Start', 'timestamp', false, false, false, 'planned_start'),
  ('batch', 'currentSugarLevel', 'Current Sugar Level (SG)', 'double', false, false, false, 'current_sugar_level'),
  ('batch', 'currentTemperature', 'Current Temperature (°C)', 'double', false, false, false, 'current_temperature'),
  ('batch', 'daysFermenting', 'Days Fermenting', 'integer', false, false, false, 'days_fermenting'),
  ('batch', 'assignedTankId', 'Assigned Tank ID', 'string', false, false, false, 'assigned_tank_id'),
  ('batch', 'assignedOperatorId', 'Assigned Operator ID', 'string', false, false, false, 'assigned_operator_id'),
  ('batch', 'lastOperatorNote', 'Operator Note', 'string', false, false, false, 'last_operator_note'),
  -- BottlingRun
  ('bottlingRun', 'id', 'Run ID', 'string', true, true, true, 'id'),
  ('bottlingRun', 'batchId', 'Batch ID', 'string', true, false, false, 'batch_id'),
  ('bottlingRun', 'lineId', 'Line ID', 'string', true, false, false, 'line_id'),
  ('bottlingRun', 'plannedStart', 'Planned Start', 'timestamp', false, false, false, 'planned_start'),
  ('bottlingRun', 'status', 'Status', 'string', true, false, false, 'status'),
  ('bottlingRun', 'assignedOperatorId', 'Assigned Operator ID', 'string', false, false, false, 'assigned_operator_id'),
  -- MaintenanceLog
  ('maintenanceLog', 'id', 'Log ID', 'string', true, true, true, 'id'),
  ('maintenanceLog', 'targetType', 'Target Type', 'string', true, false, false, 'target_type'),
  ('maintenanceLog', 'targetId', 'Target ID', 'string', true, false, false, 'target_id'),
  ('maintenanceLog', 'type', 'Type', 'string', true, false, false, 'type'),
  ('maintenanceLog', 'status', 'Status', 'string', true, false, false, 'status'),
  ('maintenanceLog', 'plannedAt', 'Planned At', 'timestamp', false, false, false, 'planned_at'),
  ('maintenanceLog', 'startedAt', 'Started At', 'timestamp', false, false, false, 'started_at'),
  ('maintenanceLog', 'completedAt', 'Completed At', 'timestamp', false, false, false, 'completed_at'),
  ('maintenanceLog', 'notes', 'Notes', 'string', false, false, false, 'notes'),
  -- Operator
  ('operator', 'id', 'ID', 'string', true, false, true, 'id'),
  ('operator', 'name', 'Name', 'string', true, true, false, 'name'),
  ('operator', 'certifications', 'Certifications', 'string_array', true, false, false, 'certifications'),
  ('operator', 'shift', 'Shift', 'string', false, false, false, 'shift'),
  -- Recipe
  ('recipe', 'id', 'ID', 'string', true, false, true, 'id'),
  ('recipe', 'name', 'Name', 'string', true, true, false, 'name'),
  ('recipe', 'targetSugarCurve', 'Target Sugar Curve', 'json', false, false, false, 'target_sugar_curve'),
  ('recipe', 'fermentationDays', 'Fermentation Days', 'integer', false, false, false, 'fermentation_days'),
  ('recipe', 'requiredIngredients', 'Required Ingredients', 'string_array', true, false, false, 'required_ingredients'),
  ('recipe', 'notes', 'Notes', 'string', false, false, false, 'notes'),
  -- QualityTest
  ('qualityTest', 'id', 'Test ID', 'string', true, true, true, 'id'),
  ('qualityTest', 'batchId', 'Batch ID', 'string', true, false, false, 'batch_id'),
  ('qualityTest', 'testDate', 'Test Date', 'timestamp', true, false, false, 'test_date'),
  ('qualityTest', 'ph', 'pH', 'double', false, false, false, 'ph'),
  ('qualityTest', 'sugarLevel', 'Sugar Level (SG)', 'double', false, false, false, 'sugar_level'),
  ('qualityTest', 'notes', 'Notes', 'string', false, false, false, 'notes'),
  ('qualityTest', 'testedBy', 'Tested By', 'string', false, false, false, 'tested_by')
) as p (object_api_name, api_name, name, data_type, required, is_title, is_primary_key, datasource_column)
join manufacturing.object_type ot on ot.api_name = p.object_api_name;

-- Each link is resolved from the source's foreign-key property, so the metadata
-- and the actual column can never drift apart.
--
-- maintenanceLog -> tank/line is deliberately absent: it is polymorphic over
-- (target_type, target_id) with no single FK column to hang a link on, so the
-- API resolves it in code.
insert into manufacturing.link
  (api_name, name, inverse_api_name, inverse_name, source_type_id, target_type_id, via_property_id, cardinality)
select l.api_name, l.name, l.inverse_api_name, l.inverse_name, src.id, tgt.id, via.id, l.cardinality
from (values
  ('batch', 'tank', 'assignedTank', 'Assigned Tank',
   'assignedBatches', 'Assigned Batches', 'assignedTankId', 'many_to_one'),
  ('batch', 'operator', 'assignedOperator', 'Assigned Operator',
   'assignedBatches', 'Assigned Batches', 'assignedOperatorId', 'many_to_one'),
  ('batch', 'recipe', 'recipe', 'Recipe',
   'batches', 'Batches', 'recipeId', 'many_to_one'),
  ('bottlingRun', 'batch', 'batch', 'Batch',
   'bottlingRuns', 'Bottling Runs', 'batchId', 'many_to_one'),
  ('bottlingRun', 'line', 'line', 'Line',
   'bottlingRuns', 'Bottling Runs', 'lineId', 'many_to_one'),
  ('bottlingRun', 'operator', 'assignedOperator', 'Assigned Operator',
   'assignedBottlingRuns', 'Assigned Bottling Runs', 'assignedOperatorId', 'many_to_one'),
  ('qualityTest', 'batch', 'batch', 'Batch',
   'qualityTests', 'Quality Tests', 'batchId', 'many_to_one')
) as l (source_api_name, target_api_name, api_name, name,
        inverse_api_name, inverse_name, via_property_api_name, cardinality)
join manufacturing.object_type src on src.api_name = l.source_api_name
join manufacturing.object_type tgt on tgt.api_name = l.target_api_name
join manufacturing.property via
  on via.object_type_id = src.id and via.api_name = l.via_property_api_name;

insert into manufacturing.action_type (object_type_id, api_name, name, description, parameter_schema)
select ot.id, 'deferStart', 'Defer Start', 'Postpone the batch''s planned start date',
  jsonb_build_object(
    '$schema', 'https://json-schema.org/draft/2020-12/schema',
    'type', 'object',
    'properties', jsonb_build_object(
      'newPlannedStart', jsonb_build_object(
        'type', 'string',
        'format', 'date-time',
        'description', 'The new planned start, as an ISO 8601 datetime'
      )
    ),
    'required', jsonb_build_array('newPlannedStart'),
    'additionalProperties', false
  )
from manufacturing.object_type ot
where ot.api_name = 'batch';

-- Keep this in step with ScheduleMaintenanceParams in the handler: the route
-- validates the body against this schema before dispatching.
insert into manufacturing.action_type (object_type_id, api_name, name, description, parameter_schema)
select ot.id, 'scheduleMaintenance', 'Schedule Maintenance',
  'Take the tank offline and record a scheduled maintenance visit',
  jsonb_build_object(
    '$schema', 'https://json-schema.org/draft/2020-12/schema',
    'type', 'object',
    'properties', jsonb_build_object(
      'type', jsonb_build_object(
        'type', 'string',
        'enum', jsonb_build_array('inspection', 'preventive', 'corrective', 'cleaning'),
        'description', 'What kind of maintenance is being scheduled'
      ),
      'plannedAt', jsonb_build_object(
        'type', 'string',
        'format', 'date-time',
        'description', 'When the work is planned, as an ISO 8601 datetime'
      ),
      'notes', jsonb_build_object(
        'type', 'string',
        'description', 'Why the visit is being scheduled, and anything the technician should know'
      )
    ),
    'required', jsonb_build_array('type', 'plannedAt', 'notes'),
    'additionalProperties', false
  )
from manufacturing.object_type ot
where ot.api_name = 'tank';

-- Keep this in step with AlertOperatorParams in the handler: the route
-- validates the body against this schema before dispatching.
--
-- Unlike the two above, this action's effect leaves the database entirely: it
-- posts to WEBHOOK_URL and changes no row. Its audit entry is the whole record.
insert into manufacturing.action_type (object_type_id, api_name, name, description, parameter_schema)
select ot.id, 'alertOperator', 'Alert Operator',
  'Send the batch''s assigned operator a message through an external system',
  jsonb_build_object(
    '$schema', 'https://json-schema.org/draft/2020-12/schema',
    'type', 'object',
    'properties', jsonb_build_object(
      'message', jsonb_build_object(
        'type', 'string',
        'minLength', 1,
        'description', 'What the operator needs to know, in plain language'
      ),
      'severity', jsonb_build_object(
        'type', 'string',
        'enum', jsonb_build_array('info', 'warning', 'critical'),
        'description', 'How urgently the operator should act on it'
      )
    ),
    'required', jsonb_build_array('message', 'severity'),
    'additionalProperties', false
  )
from manufacturing.object_type ot
where ot.api_name = 'batch';

-- ---------------------------------------------------------------------------
-- Instance data
--
-- Sugar levels are specific gravity throughout (1.050 down to 1.000), matching
-- the target_sugar_curve checkpoints on each recipe.
-- ---------------------------------------------------------------------------

insert into manufacturing.operator (id, name, certifications, shift) values
  ('op-park',  'Park Kyungwon', array['Fermentation Monitoring', 'Tank Cleaning', 'Quality Sampling'], 'Day'),
  ('EMP-2847', 'Le Linh',       array['Fermentation Monitoring', 'Tank Cleaning', 'Quality Sampling'], 'Night');

insert into manufacturing.recipe (id, name, target_sugar_curve, fermentation_days, required_ingredients, notes) values
  ('REC-LAGER-V3',   'Lager V3',     '{"day_1":1.050,"day_4":1.035,"day_8":1.012,"day_14":1.000}', 14,
   array['Malt', 'Hops', 'Yeast'],
   'V3 is sensitive to temperature fluctuations in the first 72 hours. Slow starts in the first week are usually recoverable with extended rest.'),
  ('REC-PILSNER-V2', 'Pilsner V2',   '{"day_1":1.048,"day_4":1.032,"day_8":1.010,"day_14":1.000}', 14,
   array['Pilsner Malt', 'Saaz Hops', 'Yeast'], null),
  ('REC-STOUT-V1',   'Stout V1',     '{"day_1":1.065,"day_5":1.040,"day_10":1.018,"day_18":1.012}', 18,
   array['Roasted Barley', 'Malt', 'Hops', 'Yeast'], null),
  ('REC-WHEAT-V1',   'Wheat Ale V1', '{"day_1":1.052,"day_3":1.038,"day_6":1.020,"day_10":1.008}', 10,
   array['Wheat Malt', 'Malt', 'Hops', 'Yeast'], null),
  ('REC-PALE-V2',    'Pale Ale V2',  '{"day_1":1.055,"day_4":1.036,"day_8":1.018,"day_12":1.008}', 12,
   array['Pale Malt', 'Cascade Hops', 'Yeast'], null),
  ('REC-AMBER-V1',   'Amber Ale V1', '{"day_1":1.058,"day_4":1.038,"day_7":1.020,"day_12":1.010}', 12,
   array['Crystal Malt', 'Malt', 'Hops', 'Yeast'], null),
  ('REC-PORTER-V1',  'Porter V1',    '{"day_1":1.060,"day_4":1.042,"day_8":1.022,"day_12":1.010,"day_16":1.005}', 16,
   array['Chocolate Malt', 'Malt', 'Hops', 'Yeast'], null),
  ('REC-CITRA-IPA',  'Citra IPA',    '{"day_1":1.062,"day_4":1.040,"day_8":1.020,"day_12":1.010}', 12,
   array['Pale Malt', 'Citra Hops', 'Yeast'], null);

insert into manufacturing.tank (id, name, capacity, status, current_temperature, commissioned_at) values
  ('T-12', 'FV-3',  200, 'fermenting', 12.0, '2018-06-15'),
  ('T-7',  'FV-7',  200, 'idle',       null, '2019-03-20'),
  ('T-8',  'FV-8',  200, 'idle',       null, '2019-03-20'),
  ('T-3',  'FV-1',  150, 'fermenting', 11.5, '2017-01-10'),
  ('T-5',  'FV-4',  150, 'fermenting', 12.5, '2018-02-15'),
  ('T-9',  'FV-9',  200, 'fermenting', 16.0, '2020-01-05'),
  ('T-11', 'FV-11', 200, 'fermenting', 13.0, '2020-06-15');

insert into manufacturing.line (id, name, status, commissioned_at) values
  ('L-3', 'Bottling Line 3', 'idle', '2019-08-01');

insert into manufacturing.batch (
  id, recipe_id, target_volume, status, planned_start,
  current_sugar_level, current_temperature, days_fermenting,
  assigned_tank_id, assigned_operator_id, last_operator_note
) values
  -- Fermenting
  ('B-2105', 'REC-LAGER-V3',   200, 'fermenting', '2026-04-22', 1.022, 12.0,  8, 'T-12', 'op-park',
   'foam pattern changed noticeably around day 6, unusual for Lager V3 at this stage'),
  ('B-2107', 'REC-PILSNER-V2', 150, 'fermenting', '2026-04-20', 1.010, 11.5, 10, 'T-3',  'op-park',  null),
  ('B-2110', 'REC-STOUT-V1',   200, 'fermenting', '2026-04-18', 1.018, 13.0, 12, null,   'EMP-2847', null),
  ('B-2134', 'REC-WHEAT-V1',   150, 'fermenting', '2026-04-24', 1.020, 11.5,  6, 'T-3',  'op-park',  null),
  ('B-2156', 'REC-PALE-V2',    150, 'fermenting', '2026-04-20', 1.018, 12.5, 10, 'T-5',  'EMP-2847', null),
  ('B-2179', 'REC-AMBER-V1',   200, 'fermenting', '2026-04-23', 1.025, 16.0,  7, 'T-9',  'op-park',
   'temperature creeping since glycol service yesterday, controller compensating but struggling to hold setpoint'),
  ('B-2203', 'REC-PORTER-V1',  200, 'fermenting', '2026-04-18', 1.035, 13.0, 12, 'T-11', 'EMP-2847',
   'noticed sour smell during routine check this morning, unusual for porter'),
  ('B-2098', 'REC-CITRA-IPA',  200, 'fermenting', '2026-04-10', 1.010, 12.0, 20, null,   'EMP-2847', null),

  -- Queued
  ('B-2120', 'REC-LAGER-V3',   200, 'queued', '2026-05-01', null, null, null, 'T-7',  'op-park',  null),
  ('B-2121', 'REC-PILSNER-V2', 150, 'queued', '2026-05-01', null, null, null, 'T-7',  'op-park',  null),
  ('B-2122', 'REC-WHEAT-V1',   150, 'queued', '2026-05-02', null, null, null, 'T-7',  'op-park',  null),
  -- Downstream of B-2105 on the same tank.
  ('B-2124', 'REC-LAGER-V3',   200, 'queued', '2026-05-07', null, null, null, 'T-12', 'op-park',  null),
  ('B-2130', 'REC-PILSNER-V2', 150, 'queued', '2026-05-01', null, null, null, null,   'op-park',  null),
  ('B-2117', 'REC-CITRA-IPA',  100, 'queued', '2026-05-05', null, null, null, null,   'op-park',  null),
  ('B-2118', 'REC-CITRA-IPA',  200, 'queued', '2026-05-06', null, null, null, null,   'op-park',  null),
  ('B-2125', 'REC-CITRA-IPA',  150, 'queued', '2026-05-01', null, null, null, null,   'op-park',  null),
  ('B-2126', 'REC-LAGER-V3',   200, 'queued', '2026-05-03', null, null, null, null,   'EMP-2847', null);

-- target_type holds the object type's api_name, so the polymorphic target
-- resolves against manufacturing.object_type.
insert into manufacturing.maintenance_log (id, target_type, target_id, type, status, started_at, completed_at, notes) values
  ('ML-T12-2026-04-25', 'tank', 'T-12', 'corrective', 'completed', '2026-04-25 08:00', '2026-04-25 14:00',
   'thermocouple replaced on upper sensor mount. Calibration verified post-install but readings may have shifted ±0.3°C during the 6-hour replacement window'),
  ('ML-T9-2026-04-29',  'tank', 'T-9',  'preventive', 'completed', '2026-04-29 06:00', '2026-04-29 10:00',
   'glycol valve serviced, flow rate adjusted. Post-service cooling capacity reduced ~15% until glycol system fully recharged'),
  ('ML-T11-2026-04-16', 'tank', 'T-11', 'cleaning',   'completed', '2026-04-16 08:00', '2026-04-16 12:00',
   'Cleaning cycle completed, standard protocol. No anomalies noted');

insert into manufacturing.quality_test (id, batch_id, test_date, ph, sugar_level, notes, tested_by) values
  ('QT-B2105-D7',  'B-2105', '2026-04-29', 4.2, 1.022, 'slight haze, recommend retest in 24h', 'Kim Soo-jin'),
  ('QT-B2107-D9',  'B-2107', '2026-04-29', 4.1, 1.010, 'on track, no concerns', 'Kim Soo-jin'),
  ('QT-B2110-D11', 'B-2110', '2026-04-29', 4.0, 1.018, 'on track, no concerns', 'Kim Soo-jin'),
  ('QT-B2134-D5',  'B-2134', '2026-04-29', 4.2, 1.020, 'on track, no concerns', 'Kim Soo-jin'),
  ('QT-B2156-D9',  'B-2156', '2026-04-29', 4.1, 1.018,
   'sample clean, no off-flavors detected. Sugar level slightly high but within acceptable range for day 10', 'Kim Soo-jin'),
  ('QT-B2179-D6',  'B-2179', '2026-04-29', 4.3, 1.025,
   'slight sulfur on aroma, consistent with stressed yeast. Temperature-induced, not infection. Recommend monitoring next 48h', 'Kim Soo-jin'),
  ('QT-B2203-D11', 'B-2203', '2026-04-29', 3.8, 1.035,
   'definite lactic acid presence, likely contamination. Fermentation has stalled. Recommend immediate hold and expanded testing', 'Kim Soo-jin'),
  ('QT-B2098-D19', 'B-2098', '2026-04-29', 4.1, 1.010, 'on track, no concerns', 'Kim Soo-jin');
