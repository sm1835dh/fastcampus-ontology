-- 01-manufacturing-foundation.sql
-- Seed for clips 2.3.2 onwards.
-- Applied via: pnpm run-sql seeds/01-manufacturing-foundation.sql

-- ============================================================================
-- Schema
-- ============================================================================

DROP SCHEMA IF EXISTS manufacturing CASCADE;
CREATE SCHEMA IF NOT EXISTS manufacturing;

-- ============================================================================
-- Metadata tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS manufacturing.object_type (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name      TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  visibility    TEXT NOT NULL DEFAULT 'visible',
  point_of_contact TEXT,
  edits_enabled BOOLEAN NOT NULL DEFAULT true,
  schema        TEXT NOT NULL,
  datasource_table TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manufacturing.property (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type_id   UUID NOT NULL REFERENCES manufacturing.object_type(id),
  api_name         TEXT NOT NULL,
  name             TEXT NOT NULL,
  data_type        TEXT NOT NULL,
  required         BOOLEAN NOT NULL DEFAULT false,
  is_title         BOOLEAN NOT NULL DEFAULT false,
  is_primary_key   BOOLEAN NOT NULL DEFAULT false,
  datasource_column TEXT NOT NULL,
  UNIQUE (object_type_id, api_name)
);

CREATE TABLE IF NOT EXISTS manufacturing.link (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name         TEXT NOT NULL,
  name             TEXT NOT NULL,
  inverse_api_name TEXT NOT NULL,
  inverse_name     TEXT NOT NULL,
  source_type_id   UUID NOT NULL REFERENCES manufacturing.object_type(id),
  target_type_id   UUID NOT NULL REFERENCES manufacturing.object_type(id),
  via_property_id  UUID NOT NULL REFERENCES manufacturing.property(id),
  cardinality      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manufacturing.action_type (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type_id   UUID NOT NULL REFERENCES manufacturing.object_type(id),
  api_name         TEXT NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  parameter_schema JSONB NOT NULL,
  UNIQUE (object_type_id, api_name)
);

CREATE TABLE IF NOT EXISTS manufacturing.audit_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type_id        UUID NOT NULL REFERENCES manufacturing.action_type(id),
  action_api_name       TEXT NOT NULL,
  target_type_id        UUID NOT NULL REFERENCES manufacturing.object_type(id),
  target_type_api_name  TEXT NOT NULL,
  target_id             TEXT NOT NULL,
  actor                 TEXT NOT NULL,
  params                JSONB,
  result                JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Instance tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS manufacturing.tank (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  capacity            NUMERIC NOT NULL,
  status              TEXT NOT NULL,
  current_temperature NUMERIC,
  commissioned_at     TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS manufacturing.line (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL,
  commissioned_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS manufacturing.recipe (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  target_sugar_curve    JSONB NOT NULL,
  fermentation_days     INTEGER NOT NULL,
  required_ingredients  TEXT[],
  notes                 TEXT
);

CREATE TABLE IF NOT EXISTS manufacturing.operator (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  certifications TEXT[],
  shift          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manufacturing.batch (
  id                  TEXT PRIMARY KEY,
  recipe_id           TEXT NOT NULL REFERENCES manufacturing.recipe(id),
  target_volume       NUMERIC,
  status              TEXT NOT NULL,
  planned_start       TIMESTAMPTZ,
  current_sugar_level NUMERIC,
  current_temperature NUMERIC,
  days_fermenting     INTEGER,
  assigned_tank_id    TEXT REFERENCES manufacturing.tank(id),
  assigned_operator_id TEXT REFERENCES manufacturing.operator(id),
  last_operator_note  TEXT
);

CREATE TABLE IF NOT EXISTS manufacturing.bottling_run (
  id                   TEXT PRIMARY KEY,
  batch_id             TEXT NOT NULL REFERENCES manufacturing.batch(id),
  line_id              TEXT NOT NULL REFERENCES manufacturing.line(id),
  planned_start        TIMESTAMPTZ,
  status               TEXT NOT NULL,
  assigned_operator_id TEXT REFERENCES manufacturing.operator(id)
);

CREATE TABLE IF NOT EXISTS manufacturing.maintenance_log (
  id           TEXT PRIMARY KEY,
  target_type  TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  type         TEXT NOT NULL,
  status       TEXT NOT NULL,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes        TEXT
);

CREATE TABLE IF NOT EXISTS manufacturing.quality_test (
  id          TEXT PRIMARY KEY,
  batch_id    TEXT NOT NULL REFERENCES manufacturing.batch(id),
  test_date   TIMESTAMPTZ NOT NULL,
  ph          NUMERIC,
  sugar_level NUMERIC,
  notes       TEXT,
  tested_by   TEXT
);

-- ============================================================================
-- Metadata: object types
-- ============================================================================

INSERT INTO manufacturing.object_type (id, api_name, name, description, schema, datasource_table) VALUES
  ('1455b2b2-5acf-43f3-918c-f96e13a34284',           'tank',           'Tank',            'Fermentation and conditioning vessels',       'manufacturing', 'tank'),
  ('27c798ff-25e8-46c1-a327-cdd787d4a7b0',           'line',           'Line',            'Bottling and packaging lines',                'manufacturing', 'line'),
  ('5dfc3a86-5d86-432d-8beb-d1f22cb8def6',          'batch',          'Batch',           'A volume of beer going through production',   'manufacturing', 'batch'),
  ('33cc679d-5637-4389-bcad-cc6cc4740d42',   'bottlingRun',    'Bottling Run',    'A packaging run on a bottling line',          'manufacturing', 'bottling_run'),
  ('cc8e6a87-68f8-43f0-b98a-59a0df6f2f2a',         'recipe',         'Recipe',          'Fermentation recipe with targets and notes',  'manufacturing', 'recipe'),
  ('e9bb640f-ddbe-4783-b366-abae76675204',   'qualityTest',    'Quality Test',    'Lab test results for a batch',                'manufacturing', 'quality_test'),
  ('536b5ca5-f265-4efa-a471-d4ee7b9938ad',       'operator',       'Operator',        'Brewery floor operator',                      'manufacturing', 'operator'),
  ('62d81b1d-2255-495c-8829-3f4335ac6e3b','maintenanceLog', 'Maintenance Log', 'Service event on a tank or line',             'manufacturing', 'maintenance_log')
ON CONFLICT (api_name) DO NOTHING;

-- ============================================================================
-- Metadata: properties
-- ============================================================================

-- Tank properties
INSERT INTO manufacturing.property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('13ba1eed-6c88-4ec6-81a7-3a1c16121b4c',          '1455b2b2-5acf-43f3-918c-f96e13a34284', 'id',                 'ID',                 'string',   true,  false, true,  'id'),
  ('197fabee-e605-4e53-9ba9-a09e0ccee529',        '1455b2b2-5acf-43f3-918c-f96e13a34284', 'name',               'Name',               'string',   true,  true,  false, 'name'),
  ('9ca5ced1-e4d8-42c2-9d47-50c751c798a9',    '1455b2b2-5acf-43f3-918c-f96e13a34284', 'capacity',           'Capacity (hL)',      'number',   true,  false, false, 'capacity'),
  ('04cef90d-7cae-4f31-b8eb-acce094372df',      '1455b2b2-5acf-43f3-918c-f96e13a34284', 'status',             'Status',             'enum',     true,  false, false, 'status'),
  ('d7d96cfb-2ad6-4454-a280-7496210db457',        '1455b2b2-5acf-43f3-918c-f96e13a34284', 'currentTemperature', 'Current Temperature','number',   false, false, false, 'current_temperature'),
  ('4bddce71-f591-4ee3-8952-3b94a7d40e63','1455b2b2-5acf-43f3-918c-f96e13a34284', 'commissionedAt',     'Commissioned',       'datetime', false, false, false, 'commissioned_at')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

-- Line properties
INSERT INTO manufacturing.property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('729c9e2e-28bc-4c89-b00e-71b21a4fb581',          '27c798ff-25e8-46c1-a327-cdd787d4a7b0', 'id',             'ID',          'string',   true,  false, true,  'id'),
  ('e67775d2-9fc6-4cdb-8da3-eade8041a29c',        '27c798ff-25e8-46c1-a327-cdd787d4a7b0', 'name',           'Name',        'string',   true,  true,  false, 'name'),
  ('ecb2a4dc-45ad-4ab7-b5cc-81730e681552',      '27c798ff-25e8-46c1-a327-cdd787d4a7b0', 'status',         'Status',      'enum',     true,  false, false, 'status'),
  ('02082bef-f8e0-4b91-982e-1d1f6a60a6c8','27c798ff-25e8-46c1-a327-cdd787d4a7b0', 'commissionedAt', 'Commissioned','datetime', false, false, false, 'commissioned_at')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

-- Batch properties
INSERT INTO manufacturing.property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('c8356cc4-e405-4c5b-96a1-ff0ecdd44af6',            '5dfc3a86-5d86-432d-8beb-d1f22cb8def6', 'id',                 'ID',                  'string',   true,  true,  true,  'id'),
  ('51ced883-8c23-4eee-af2c-9f40010bed64',        '5dfc3a86-5d86-432d-8beb-d1f22cb8def6', 'recipeId',           'Recipe',              'string',   true,  false, false, 'recipe_id'),
  ('b7dd6235-93a1-49ee-aa92-f6eae345c66c',        '5dfc3a86-5d86-432d-8beb-d1f22cb8def6', 'targetVolume',       'Target Volume',       'number',   false, false, false, 'target_volume'),
  ('8d4251de-0002-4c98-8d90-a02eef1ce36f',        '5dfc3a86-5d86-432d-8beb-d1f22cb8def6', 'status',             'Status',              'enum',     true,  false, false, 'status'),
  ('d980bed5-5b93-44af-b955-663c520242c6',       '5dfc3a86-5d86-432d-8beb-d1f22cb8def6', 'plannedStart',       'Planned Start',       'datetime', false, false, false, 'planned_start'),
  ('94adca67-332b-45f2-9b6f-8fe8251c2a05',         '5dfc3a86-5d86-432d-8beb-d1f22cb8def6', 'currentSugarLevel',  'Current Sugar Level', 'number',   false, false, false, 'current_sugar_level'),
  ('54ee505e-d31e-4fdd-a660-2940e78a8db8',          '5dfc3a86-5d86-432d-8beb-d1f22cb8def6', 'currentTemperature', 'Current Temperature', 'number',   false, false, false, 'current_temperature'),
  ('0fc91371-d9b1-498a-934e-573e8e633c49',          '5dfc3a86-5d86-432d-8beb-d1f22cb8def6', 'daysFermenting',     'Days Fermenting',     'number',   false, false, false, 'days_fermenting'),
  ('5e77d98d-6778-4f65-a92b-c90cc8059c8b',          '5dfc3a86-5d86-432d-8beb-d1f22cb8def6', 'assignedTankId',     'Assigned Tank',       'string',   false, false, false, 'assigned_tank_id'),
  ('6440fcdc-bee3-4036-adde-a10e93f0e409',      '5dfc3a86-5d86-432d-8beb-d1f22cb8def6', 'assignedOperatorId', 'Assigned Operator',   'string',   false, false, false, 'assigned_operator_id'),
  ('bdec3153-b118-4652-804a-d01830571488',          '5dfc3a86-5d86-432d-8beb-d1f22cb8def6', 'lastOperatorNote',   'Operator Note',       'string',   false, false, false, 'last_operator_note')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

-- BottlingRun properties
INSERT INTO manufacturing.property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('a0def416-7da8-4c40-b668-fa9578f0fb61',       '33cc679d-5637-4389-bcad-cc6cc4740d42', 'id',                 'ID',                'string',   true,  true,  true,  'id'),
  ('00aa6ad7-77b1-4221-8319-b97701414e88',    '33cc679d-5637-4389-bcad-cc6cc4740d42', 'batchId',            'Batch',             'string',   true,  false, false, 'batch_id'),
  ('90245ac7-ce26-4e08-be78-277f9bf60dfb',     '33cc679d-5637-4389-bcad-cc6cc4740d42', 'lineId',             'Line',              'string',   true,  false, false, 'line_id'),
  ('760853ee-2521-4cb8-b077-6e0ec6769510',  '33cc679d-5637-4389-bcad-cc6cc4740d42', 'plannedStart',       'Planned Start',     'datetime', false, false, false, 'planned_start'),
  ('397acfd9-91a7-46d2-ad71-b7709da9e509',   '33cc679d-5637-4389-bcad-cc6cc4740d42', 'status',             'Status',            'enum',     true,  false, false, 'status'),
  ('3fde46f6-8b6a-4407-a78f-36e23602f4d8', '33cc679d-5637-4389-bcad-cc6cc4740d42', 'assignedOperatorId', 'Assigned Operator', 'string',   false, false, false, 'assigned_operator_id')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

-- Recipe properties
INSERT INTO manufacturing.property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('5f27f908-5fab-4133-8989-43d92081f9ae',          'cc8e6a87-68f8-43f0-b98a-59a0df6f2f2a', 'id',                  'ID',                  'string',   true,  false, true,  'id'),
  ('0782f5fa-4fdb-49e6-9620-9da73a73be3d',        'cc8e6a87-68f8-43f0-b98a-59a0df6f2f2a', 'name',                'Name',                'string',   true,  true,  false, 'name'),
  ('826e5ccd-98dc-48ce-851f-773c4962bd4d',       'cc8e6a87-68f8-43f0-b98a-59a0df6f2f2a', 'targetSugarCurve',    'Target Sugar Curve',  'json',     true,  false, false, 'target_sugar_curve'),
  ('4bf9f183-5a5e-4d8e-bff1-e04892685a8b',        'cc8e6a87-68f8-43f0-b98a-59a0df6f2f2a', 'fermentationDays',    'Fermentation Days',   'number',   true,  false, false, 'fermentation_days'),
  ('ccf6138b-bf93-4e90-bcb9-9848486fb8b6', 'cc8e6a87-68f8-43f0-b98a-59a0df6f2f2a', 'requiredIngredients', 'Required Ingredients','string[]', false, false, false, 'required_ingredients'),
  ('f2b230b4-1674-4d88-a41e-3078596a8a5c',       'cc8e6a87-68f8-43f0-b98a-59a0df6f2f2a', 'notes',               'Notes',               'string',   false, false, false, 'notes')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

-- QualityTest properties
INSERT INTO manufacturing.property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('7811dd9c-60df-4b6d-8190-7b0dc98829aa',       'e9bb640f-ddbe-4783-b366-abae76675204', 'id',         'ID',          'string',   true,  true,  true,  'id'),
  ('17117dd6-32d7-434d-8ff7-aa31aaba191a',    'e9bb640f-ddbe-4783-b366-abae76675204', 'batchId',    'Batch',       'string',   true,  false, false, 'batch_id'),
  ('cb38cb15-0636-4192-b49f-56289aa7875d',     'e9bb640f-ddbe-4783-b366-abae76675204', 'testDate',   'Test Date',   'datetime', true,  false, false, 'test_date'),
  ('2eb62152-ee4f-4c22-838d-236687cc3dfb',       'e9bb640f-ddbe-4783-b366-abae76675204', 'pH',         'pH',          'number',   false, false, false, 'ph'),
  ('71423733-2aa7-4f1c-a949-bb9772c44468',    'e9bb640f-ddbe-4783-b366-abae76675204', 'sugarLevel', 'Sugar Level', 'number',   false, false, false, 'sugar_level'),
  ('61f17ad5-039b-45db-b8ea-58cbc5f60a7a',    'e9bb640f-ddbe-4783-b366-abae76675204', 'notes',      'Notes',       'string',   false, false, false, 'notes'),
  ('18acedce-b11c-4a89-a24c-ef32e18239d6',   'e9bb640f-ddbe-4783-b366-abae76675204', 'testedBy',   'Tested By',   'string',   false, false, false, 'tested_by')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

-- Operator properties
INSERT INTO manufacturing.property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('ffad3157-a876-4bb5-b4c3-8e151eef49d9',     '536b5ca5-f265-4efa-a471-d4ee7b9938ad', 'id',             'ID',             'string',   true,  false, true,  'id'),
  ('4975303f-25b1-4fa6-b21f-f45eadbf8da4',   '536b5ca5-f265-4efa-a471-d4ee7b9938ad', 'name',           'Name',           'string',   true,  true,  false, 'name'),
  ('d055a249-4944-448c-801b-ab7ba4eebc89',  '536b5ca5-f265-4efa-a471-d4ee7b9938ad', 'certifications', 'Certifications', 'string[]', false, false, false, 'certifications'),
  ('a241b2cc-2544-427e-bb76-28b05b6a26f8',  '536b5ca5-f265-4efa-a471-d4ee7b9938ad', 'shift',          'Shift',          'string',   true,  false, false, 'shift')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

-- MaintenanceLog properties
INSERT INTO manufacturing.property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('fac63d00-2793-4ed8-b6cc-6ca1f492ed83',        '62d81b1d-2255-495c-8829-3f4335ac6e3b', 'id',          'ID',           'string',   true,  true,  true,  'id'),
  ('33f28dde-66a7-44d1-8ecf-b7adcd0b0e9e',     '62d81b1d-2255-495c-8829-3f4335ac6e3b', 'targetType',  'Target Type',  'string',   true,  false, false, 'target_type'),
  ('7e730a8e-54cd-478d-9af6-e712cf159d34',       '62d81b1d-2255-495c-8829-3f4335ac6e3b', 'targetId',    'Target ID',    'string',   true,  false, false, 'target_id'),
  ('2f881e34-47a3-47fc-a7ee-5040402c60b6',      '62d81b1d-2255-495c-8829-3f4335ac6e3b', 'type',        'Type',         'enum',     true,  false, false, 'type'),
  ('53d2abcd-6827-40e6-bc72-856e98e03ef7',    '62d81b1d-2255-495c-8829-3f4335ac6e3b', 'status',      'Status',       'enum',     true,  false, false, 'status'),
  ('16149095-78f4-4d14-94e6-74074525b77e',   '62d81b1d-2255-495c-8829-3f4335ac6e3b', 'startedAt',   'Started At',   'datetime', false, false, false, 'started_at'),
  ('2e4718b0-2077-411f-89b9-7f3f461480a1', '62d81b1d-2255-495c-8829-3f4335ac6e3b', 'completedAt', 'Completed At', 'datetime', false, false, false, 'completed_at'),
  ('090f98ba-129f-4f33-ad92-49bfdde092f4',     '62d81b1d-2255-495c-8829-3f4335ac6e3b', 'notes',       'Notes',        'string',   false, false, false, 'notes')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

-- ============================================================================
-- Metadata: links
-- ============================================================================

INSERT INTO manufacturing.link (id, api_name, name, inverse_api_name, inverse_name, source_type_id, target_type_id, via_property_id, cardinality) VALUES
  ('9ea8f754-fade-43f4-ab40-8a95d252319c',     'assignedTank',     'Assigned Tank',     'assignedBatches',  'Assigned Batches',  '5dfc3a86-5d86-432d-8beb-d1f22cb8def6',        '1455b2b2-5acf-43f3-918c-f96e13a34284',     '5e77d98d-6778-4f65-a92b-c90cc8059c8b',     'many_to_one'),
  ('85da861d-812b-4dfe-8f9e-e83200a80168', 'assignedOperator', 'Assigned Operator', 'assignedBatches',  'Assigned Batches',  '5dfc3a86-5d86-432d-8beb-d1f22cb8def6',        '536b5ca5-f265-4efa-a471-d4ee7b9938ad', '6440fcdc-bee3-4036-adde-a10e93f0e409', 'many_to_one'),
  ('41fbe48a-e314-411b-8f63-5ae509b472f2',   'recipe',           'Recipe',            'batches',          'Batches',           '5dfc3a86-5d86-432d-8beb-d1f22cb8def6',        'cc8e6a87-68f8-43f0-b98a-59a0df6f2f2a',   '51ced883-8c23-4eee-af2c-9f40010bed64',   'many_to_one'),
  ('02c458ca-916c-49cf-8910-3e795ae076d0',       'batch',            'Batch',             'bottlingRuns',     'Bottling Runs',     '33cc679d-5637-4389-bcad-cc6cc4740d42', '5dfc3a86-5d86-432d-8beb-d1f22cb8def6',    '00aa6ad7-77b1-4221-8319-b97701414e88',       'many_to_one'),
  ('c7b7fd46-8324-4e70-9688-eb1bec5cb596',        'line',             'Line',              'bottlingRuns',     'Bottling Runs',     '33cc679d-5637-4389-bcad-cc6cc4740d42', '27c798ff-25e8-46c1-a327-cdd787d4a7b0',     '90245ac7-ce26-4e08-be78-277f9bf60dfb',        'many_to_one'),
  ('30033310-381c-4436-a76c-34ef92ad51be',       'batch',            'Batch',             'qualityTests',     'Quality Tests',     'e9bb640f-ddbe-4783-b366-abae76675204', '5dfc3a86-5d86-432d-8beb-d1f22cb8def6',    '17117dd6-32d7-434d-8ff7-aa31aaba191a',       'many_to_one'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'assignedOperator', 'Assigned Operator', 'assignedBottlingRuns', 'Assigned Bottling Runs', '33cc679d-5637-4389-bcad-cc6cc4740d42', '536b5ca5-f265-4efa-a471-d4ee7b9938ad', '3fde46f6-8b6a-4407-a78f-36e23602f4d8', 'many_to_one')
ON CONFLICT DO NOTHING;
-- Note: MaintenanceLog → Tank/Line is polymorphic (targetType + targetId). Not expressed as a link row — resolved in application code.

-- ============================================================================
-- Metadata: action types (only deferStart in foundation)
-- ============================================================================

INSERT INTO manufacturing.action_type (id, object_type_id, api_name, name, description, parameter_schema) VALUES
  ('c031c15f-3f5e-4baa-a375-be4252d19e48', '5dfc3a86-5d86-432d-8beb-d1f22cb8def6', 'deferStart', 'Defer Start', 'Postpone the batch''s planned start date', '{"type":"object","properties":{"newPlannedStart":{"type":"string","format":"date-time"}},"required":["newPlannedStart"]}')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

-- ============================================================================
-- Instance data: Operators
-- ============================================================================

INSERT INTO manufacturing.operator (id, name, certifications, shift) VALUES
  ('op-park',  'Park Kyungwon',  ARRAY['Fermentation Monitoring', 'Tank Cleaning', 'Quality Sampling'], 'Day'),
  ('EMP-2847', 'Le Linh',  ARRAY['Fermentation Monitoring', 'Tank Cleaning', 'Quality Sampling'], 'Night')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Instance data: Recipes
-- ============================================================================

INSERT INTO manufacturing.recipe (id, name, target_sugar_curve, fermentation_days, required_ingredients, notes) VALUES
  ('REC-LAGER-V3',   'Lager V3',      '{"day_1":1.050,"day_4":1.035,"day_8":1.012,"day_14":1.000}', 14, ARRAY['Malt','Hops','Yeast'],         'V3 is sensitive to temperature fluctuations in the first 72 hours. Slow starts in the first week are usually recoverable with extended rest.'),
  ('REC-PILSNER-V2', 'Pilsner V2',    '{"day_1":1.048,"day_4":1.032,"day_8":1.010,"day_14":1.000}', 14, ARRAY['Pilsner Malt','Saaz Hops','Yeast'], NULL),
  ('REC-STOUT-V1',   'Stout V1',      '{"day_1":1.065,"day_5":1.040,"day_10":1.018,"day_18":1.012}', 18, ARRAY['Roasted Barley','Malt','Hops','Yeast'], NULL),
  ('REC-WHEAT-V1',   'Wheat Ale V1',  '{"day_1":1.052,"day_3":1.038,"day_6":1.020,"day_10":1.008}', 10, ARRAY['Wheat Malt','Malt','Hops','Yeast'], NULL),
  ('REC-PALE-V2',    'Pale Ale V2',   '{"day_1":1.055,"day_4":1.036,"day_8":1.018,"day_12":1.008}', 12, ARRAY['Pale Malt','Cascade Hops','Yeast'], NULL),
  ('REC-AMBER-V1',   'Amber Ale V1',  '{"day_1":1.058,"day_4":1.038,"day_7":1.020,"day_12":1.010}', 12, ARRAY['Crystal Malt','Malt','Hops','Yeast'], NULL),
  ('REC-PORTER-V1',  'Porter V1',     '{"day_1":1.060,"day_4":1.042,"day_8":1.022,"day_12":1.010,"day_16":1.005}', 16, ARRAY['Chocolate Malt','Malt','Hops','Yeast'], NULL),
  ('REC-CITRA-IPA',  'Citra IPA',     '{"day_1":1.062,"day_4":1.040,"day_8":1.020,"day_12":1.010}', 12, ARRAY['Pale Malt','Citra Hops','Yeast'], NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Instance data: Tanks
-- ============================================================================

INSERT INTO manufacturing.tank (id, name, capacity, status, current_temperature, commissioned_at) VALUES
  ('T-12', 'FV-3',  200, 'fermenting',  12.0, '2018-06-15'),
  ('T-7',  'FV-7',  200, 'idle',        NULL, '2019-03-20'),
  ('T-8',  'FV-8',  200, 'idle',        NULL, '2019-03-20'),
  ('T-3',  'FV-1',  150, 'fermenting',  11.5, '2017-01-10'),
  ('T-5',  'FV-4',  150, 'fermenting',  12.5, '2018-02-15'),
  ('T-9',  'FV-9',  200, 'fermenting',  16.0, '2020-01-05'),
  ('T-11', 'FV-11', 200, 'fermenting',  13.0, '2020-06-15')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Instance data: Lines
-- ============================================================================

INSERT INTO manufacturing.line (id, name, status, commissioned_at) VALUES
  ('L-3', 'Bottling Line 3', 'idle', '2019-08-01')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Instance data: Batches
-- ============================================================================

INSERT INTO manufacturing.batch (id, recipe_id, target_volume, status, planned_start, current_sugar_level, current_temperature, days_fermenting, assigned_tank_id, assigned_operator_id, last_operator_note) VALUES
  -- Fermenting batches (active)
  ('B-2105', 'REC-LAGER-V3',   200, 'fermenting', '2026-04-22', 1.022, 12.0,  8,  'T-12', 'op-park',  'foam pattern changed noticeably around day 6, unusual for Lager V3 at this stage'),
  ('B-2107', 'REC-PILSNER-V2', 150, 'fermenting', '2026-04-20', 1.010, 11.5,  10, 'T-3',  'op-park',  NULL),
  ('B-2110', 'REC-STOUT-V1',   200, 'fermenting', '2026-04-18', 1.018, 13.0,  12, NULL,   'EMP-2847', NULL),
  ('B-2134', 'REC-WHEAT-V1',   150, 'fermenting', '2026-04-24', 1.020, 11.5,  6,  'T-3',  'op-park',  NULL),
  ('B-2156', 'REC-PALE-V2',    150, 'fermenting', '2026-04-20', 1.018, 12.5,  10, 'T-5',  'EMP-2847', NULL),
  ('B-2179', 'REC-AMBER-V1',   200, 'fermenting', '2026-04-23', 1.025, 16.0,  7,  'T-9',  'op-park',  'temperature creeping since glycol service yesterday, controller compensating but struggling to hold setpoint'),
  ('B-2203', 'REC-PORTER-V1',  200, 'fermenting', '2026-04-18', 1.035, 13.0,  12, 'T-11', 'EMP-2847', 'noticed sour smell during routine check this morning, unusual for porter'),

  -- Queued batches (for shift report scenario in 3.2.3)
  ('B-2120', 'REC-LAGER-V3',   200, 'queued', '2026-05-01', NULL, NULL, NULL, 'T-7',  'op-park',  NULL),
  ('B-2121', 'REC-PILSNER-V2', 150, 'queued', '2026-05-01', NULL, NULL, NULL, 'T-7',  'op-park',  NULL),
  ('B-2122', 'REC-WHEAT-V1',   150, 'queued', '2026-05-02', NULL, NULL, NULL, 'T-7',  'op-park',  NULL),

  -- Queued batch downstream of B-2105 on same tank
  ('B-2124', 'REC-LAGER-V3',   200, 'queued', '2026-05-07', NULL, NULL, NULL, 'T-12', 'op-park',  NULL),

  -- Generic queued batch (for demos in 3.1.1, 3.3.1, 4.2.2)
  ('B-2130', 'REC-PILSNER-V2', 150, 'queued', '2026-05-01', NULL, NULL, NULL, NULL,   'op-park',  NULL),

  -- Citra batches (for HITL scenario in 3.3.2)
  ('B-2098', 'REC-CITRA-IPA',  200, 'fermenting', '2026-04-10', 1.010, 12.0, 20, NULL, 'EMP-2847', NULL),
  ('B-2117', 'REC-CITRA-IPA',  100, 'queued',     '2026-05-05', NULL,  NULL, NULL, NULL, 'op-park', NULL),
  ('B-2118', 'REC-CITRA-IPA',  200, 'queued',     '2026-05-06', NULL,  NULL, NULL, NULL, 'op-park', NULL),
  ('B-2125', 'REC-CITRA-IPA',  150, 'queued',     '2026-05-01', NULL,  NULL, NULL, NULL, 'op-park', NULL),
  ('B-2126', 'REC-LAGER-V3',   200, 'queued',     '2026-05-03', NULL,  NULL, NULL, NULL, 'EMP-2847', NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Instance data: Maintenance logs
-- ============================================================================

INSERT INTO manufacturing.maintenance_log (id, target_type, target_id, type, status, started_at, completed_at, notes) VALUES
  ('ML-T12-2026-04-25', 'tank', 'T-12', 'corrective',  'completed', '2026-04-25 08:00', '2026-04-25 14:00', 'thermocouple replaced on upper sensor mount. Calibration verified post-install but readings may have shifted ±0.3°C during the 6-hour replacement window'),
  ('ML-T9-2026-04-29',  'tank', 'T-9',  'preventive',  'completed', '2026-04-29 06:00', '2026-04-29 10:00', 'glycol valve serviced, flow rate adjusted. Post-service cooling capacity reduced ~15% until glycol system fully recharged'),
  ('ML-T11-2026-04-16', 'tank', 'T-11', 'cleaning',    'completed', '2026-04-16 08:00', '2026-04-16 12:00', 'Cleaning cycle completed, standard protocol. No anomalies noted')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Instance data: Quality tests
-- ============================================================================

INSERT INTO manufacturing.quality_test (id, batch_id, test_date, ph, sugar_level, notes, tested_by) VALUES
  ('QT-B2105-D7', 'B-2105', '2026-04-29', 4.2, 1.022, 'slight haze, recommend retest in 24h',                                                            'Kim Soo-jin'),
  ('QT-B2107-D9', 'B-2107', '2026-04-29', 4.1, 1.010, 'on track, no concerns',                                                                            'Kim Soo-jin'),
  ('QT-B2110-D11','B-2110', '2026-04-29', 4.0, 1.018, 'on track, no concerns',                                                                            'Kim Soo-jin'),
  ('QT-B2134-D5', 'B-2134', '2026-04-29', 4.2, 1.020, 'on track, no concerns',                                                                            'Kim Soo-jin'),
  ('QT-B2156-D9', 'B-2156', '2026-04-29', 4.1, 1.018, 'sample clean, no off-flavors detected. Sugar level slightly high but within acceptable range for day 10', 'Kim Soo-jin'),
  ('QT-B2179-D6', 'B-2179', '2026-04-29', 4.3, 1.025, 'slight sulfur on aroma, consistent with stressed yeast. Temperature-induced, not infection. Recommend monitoring next 48h', 'Kim Soo-jin'),
  ('QT-B2203-D11','B-2203', '2026-04-29', 3.8, 1.035, 'definite lactic acid presence, likely contamination. Fermentation has stalled. Recommend immediate hold and expanded testing', 'Kim Soo-jin'),
  ('QT-B2098-D19','B-2098', '2026-04-29', 4.1, 1.010, 'on track, no concerns',                                                                            'Kim Soo-jin')
ON CONFLICT (id) DO NOTHING;
