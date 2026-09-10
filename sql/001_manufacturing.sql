-- Creates the `manufacturing` schema: eight instance tables holding the brewery's
-- real data, plus the metadata tables that describe those types to the ontology API.
--
--   pnpm run-sql sql/001_manufacturing.sql
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
  -- Expected sugar level per fermentation day: [{"day": 0, "sugarLevel": 12.4}, ...]
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
  current_sugar_level  numeric(5, 2),
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
  sugar_level numeric(5, 2),
  notes       text,
  tested_by   text
);

create table manufacturing.maintenance_log (
  id           text primary key,
  -- Polymorphic target: target_type names the object type ('Tank', 'Line') and
  -- target_id holds its domain ID. No FK constraint can span both tables.
  target_type  text not null,
  target_id    text not null,
  type         text not null,
  status       text not null,
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
  -- How the link reads from the target side (Tank.assignedBatches).
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
  ('Tank', 'Tank', 'A fermentation vessel on the brewery floor.',
   'active', 'prominent', 'brewing-ops@example.com', true, 'manufacturing', 'tank'),
  ('Line', 'Bottling Line', 'A bottling line that packages finished batches.',
   'active', 'normal', 'packaging@example.com', true, 'manufacturing', 'line'),
  ('Batch', 'Batch', 'One production run of a recipe, from pitch through packaging.',
   'active', 'prominent', 'brewing-ops@example.com', true, 'manufacturing', 'batch'),
  ('BottlingRun', 'Bottling Run', 'A scheduled pass of a batch through a bottling line.',
   'active', 'normal', 'packaging@example.com', true, 'manufacturing', 'bottling_run'),
  ('MaintenanceLog', 'Maintenance Log', 'Maintenance performed on a tank or a line.',
   'active', 'normal', 'maintenance@example.com', true, 'manufacturing', 'maintenance_log'),
  ('Operator', 'Operator', 'A person certified to run brewery equipment.',
   'active', 'normal', 'people-ops@example.com', true, 'manufacturing', 'operator'),
  ('Recipe', 'Recipe', 'The specification a batch is brewed against.',
   'active', 'prominent', 'brewing-ops@example.com', true, 'manufacturing', 'recipe'),
  ('QualityTest', 'Quality Test', 'A lab measurement taken against a fermenting batch.',
   'active', 'normal', 'quality@example.com', true, 'manufacturing', 'quality_test');

-- Property api_names are camelCase; datasource_column is the snake_case column
-- it reads from. Types with no name column use their domain ID as the title.
insert into manufacturing.property
  (object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column)
select ot.id, p.api_name, p.name, p.data_type, p.required, p.is_title, p.is_primary_key, p.datasource_column
from (values
  -- Tank
  ('Tank', 'id', 'ID', 'string', true, false, true, 'id'),
  ('Tank', 'name', 'Name', 'string', true, true, false, 'name'),
  ('Tank', 'capacity', 'Capacity (L)', 'integer', false, false, false, 'capacity'),
  ('Tank', 'status', 'Status', 'string', true, false, false, 'status'),
  ('Tank', 'currentTemperature', 'Current Temperature (°C)', 'double', false, false, false, 'current_temperature'),
  ('Tank', 'commissionedAt', 'Commissioned At', 'timestamp', false, false, false, 'commissioned_at'),
  -- Line
  ('Line', 'id', 'ID', 'string', true, false, true, 'id'),
  ('Line', 'name', 'Name', 'string', true, true, false, 'name'),
  ('Line', 'status', 'Status', 'string', true, false, false, 'status'),
  ('Line', 'commissionedAt', 'Commissioned At', 'timestamp', false, false, false, 'commissioned_at'),
  -- Batch
  ('Batch', 'id', 'Batch ID', 'string', true, true, true, 'id'),
  ('Batch', 'recipeId', 'Recipe ID', 'string', true, false, false, 'recipe_id'),
  ('Batch', 'targetVolume', 'Target Volume (L)', 'integer', false, false, false, 'target_volume'),
  ('Batch', 'status', 'Status', 'string', true, false, false, 'status'),
  ('Batch', 'plannedStart', 'Planned Start', 'timestamp', false, false, false, 'planned_start'),
  ('Batch', 'currentSugarLevel', 'Current Sugar Level (°P)', 'double', false, false, false, 'current_sugar_level'),
  ('Batch', 'currentTemperature', 'Current Temperature (°C)', 'double', false, false, false, 'current_temperature'),
  ('Batch', 'daysFermenting', 'Days Fermenting', 'integer', false, false, false, 'days_fermenting'),
  ('Batch', 'assignedTankId', 'Assigned Tank ID', 'string', false, false, false, 'assigned_tank_id'),
  ('Batch', 'assignedOperatorId', 'Assigned Operator ID', 'string', false, false, false, 'assigned_operator_id'),
  ('Batch', 'lastOperatorNote', 'Last Operator Note', 'string', false, false, false, 'last_operator_note'),
  -- BottlingRun
  ('BottlingRun', 'id', 'Run ID', 'string', true, true, true, 'id'),
  ('BottlingRun', 'batchId', 'Batch ID', 'string', true, false, false, 'batch_id'),
  ('BottlingRun', 'lineId', 'Line ID', 'string', true, false, false, 'line_id'),
  ('BottlingRun', 'plannedStart', 'Planned Start', 'timestamp', false, false, false, 'planned_start'),
  ('BottlingRun', 'status', 'Status', 'string', true, false, false, 'status'),
  ('BottlingRun', 'assignedOperatorId', 'Assigned Operator ID', 'string', false, false, false, 'assigned_operator_id'),
  -- MaintenanceLog
  ('MaintenanceLog', 'id', 'Log ID', 'string', true, true, true, 'id'),
  ('MaintenanceLog', 'targetType', 'Target Type', 'string', true, false, false, 'target_type'),
  ('MaintenanceLog', 'targetId', 'Target ID', 'string', true, false, false, 'target_id'),
  ('MaintenanceLog', 'type', 'Maintenance Type', 'string', true, false, false, 'type'),
  ('MaintenanceLog', 'status', 'Status', 'string', true, false, false, 'status'),
  ('MaintenanceLog', 'startedAt', 'Started At', 'timestamp', false, false, false, 'started_at'),
  ('MaintenanceLog', 'completedAt', 'Completed At', 'timestamp', false, false, false, 'completed_at'),
  ('MaintenanceLog', 'notes', 'Notes', 'string', false, false, false, 'notes'),
  -- Operator
  ('Operator', 'id', 'ID', 'string', true, false, true, 'id'),
  ('Operator', 'name', 'Name', 'string', true, true, false, 'name'),
  ('Operator', 'certifications', 'Certifications', 'string_array', true, false, false, 'certifications'),
  ('Operator', 'shift', 'Shift', 'string', false, false, false, 'shift'),
  -- Recipe
  ('Recipe', 'id', 'ID', 'string', true, false, true, 'id'),
  ('Recipe', 'name', 'Name', 'string', true, true, false, 'name'),
  ('Recipe', 'targetSugarCurve', 'Target Sugar Curve', 'json', false, false, false, 'target_sugar_curve'),
  ('Recipe', 'fermentationDays', 'Fermentation Days', 'integer', false, false, false, 'fermentation_days'),
  ('Recipe', 'requiredIngredients', 'Required Ingredients', 'string_array', true, false, false, 'required_ingredients'),
  ('Recipe', 'notes', 'Notes', 'string', false, false, false, 'notes'),
  -- QualityTest
  ('QualityTest', 'id', 'Test ID', 'string', true, true, true, 'id'),
  ('QualityTest', 'batchId', 'Batch ID', 'string', true, false, false, 'batch_id'),
  ('QualityTest', 'testDate', 'Test Date', 'timestamp', true, false, false, 'test_date'),
  ('QualityTest', 'ph', 'pH', 'double', false, false, false, 'ph'),
  ('QualityTest', 'sugarLevel', 'Sugar Level (°P)', 'double', false, false, false, 'sugar_level'),
  ('QualityTest', 'notes', 'Notes', 'string', false, false, false, 'notes'),
  ('QualityTest', 'testedBy', 'Tested By', 'string', false, false, false, 'tested_by')
) as p (object_api_name, api_name, name, data_type, required, is_title, is_primary_key, datasource_column)
join manufacturing.object_type ot on ot.api_name = p.object_api_name;

-- Each link is resolved from the source's foreign-key property, so the metadata
-- and the actual column can never drift apart.
insert into manufacturing.link
  (api_name, name, inverse_api_name, inverse_name, source_type_id, target_type_id, via_property_id, cardinality)
select l.api_name, l.name, l.inverse_api_name, l.inverse_name, src.id, tgt.id, via.id, l.cardinality
from (values
  ('Batch', 'Tank', 'assignedTank', 'Assigned Tank',
   'assignedBatches', 'Assigned Batches', 'assignedTankId', 'many_to_one'),
  ('Batch', 'Operator', 'assignedOperator', 'Assigned Operator',
   'assignedBatches', 'Assigned Batches', 'assignedOperatorId', 'many_to_one'),
  ('Batch', 'Recipe', 'recipe', 'Recipe',
   'batches', 'Batches', 'recipeId', 'many_to_one'),
  ('BottlingRun', 'Batch', 'batch', 'Batch',
   'bottlingRuns', 'Bottling Runs', 'batchId', 'many_to_one'),
  ('BottlingRun', 'Line', 'line', 'Line',
   'bottlingRuns', 'Bottling Runs', 'lineId', 'many_to_one'),
  ('QualityTest', 'Batch', 'batch', 'Batch',
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
where ot.api_name = 'Batch';

-- ---------------------------------------------------------------------------
-- Test data: one tank, one recipe, one operator, and a batch tying them together.
-- ---------------------------------------------------------------------------

insert into manufacturing.tank (id, name, capacity, status, current_temperature, commissioned_at)
values ('T-12', 'Fermenter 12', 5000, 'in_use', 12.4, '2023-03-14T09:00:00+09');

insert into manufacturing.recipe
  (id, name, target_sugar_curve, fermentation_days, required_ingredients, notes)
values (
  'REC-LAGER-V3',
  'Pilsner Lager v3',
  -- Expected °Plato at each day of fermentation.
  '[{"day": 0,  "sugarLevel": 12.4},
    {"day": 3,  "sugarLevel": 9.8},
    {"day": 6,  "sugarLevel": 6.5},
    {"day": 9,  "sugarLevel": 4.1},
    {"day": 12, "sugarLevel": 2.9},
    {"day": 14, "sugarLevel": 2.6}]'::jsonb,
  14,
  array['pilsner malt', 'saaz hops', 'lager yeast', 'brewing water'],
  'Hold at 12°C through day 9, then free rise for the diacetyl rest.'
);

insert into manufacturing.operator (id, name, certifications, shift)
values ('OP-7', 'Park Kyungwon', array['fermentation', 'cip', 'forklift'], 'day');

insert into manufacturing.batch (
  id, recipe_id, target_volume, status, planned_start,
  current_sugar_level, current_temperature, days_fermenting,
  assigned_tank_id, assigned_operator_id, last_operator_note
) values (
  'B-2105', 'REC-LAGER-V3', 4500, 'fermenting', '2026-09-04T08:00:00+09',
  6.4, 12.4, 6,
  'T-12', 'OP-7', 'Krausen dropped overnight; gravity tracking on curve.'
);
