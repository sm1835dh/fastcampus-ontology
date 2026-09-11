import { Callout, Card, EditableText, H2, Icon, Tag } from "@blueprintjs/core";
import type { ObjectType, ObjectTypeListing, TypeBundle } from "../api.ts";
import ActionTypesCard from "./ActionTypesCard.tsx";
import LinkTypesCard from "./LinkTypesCard.tsx";
import PropertiesCard from "./PropertiesCard.tsx";

type Props = {
  bundle: TypeBundle;
  types: ObjectTypeListing[];
  onSelect: (apiName: string) => void;
  onSave: (patch: { name?: string; description?: string | null }) => void;
  saveError: string | null;
  /** Bumped when a save fails, to reset the editors back to the stored values. */
  revision: number;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="om-field">
      <div className="om-field__label">{label}</div>
      <div className="om-field__value">{children}</div>
    </div>
  );
}

function statusIntent(status: string) {
  return status === "active" ? "success" : "none";
}

function StatusPanel({ objectType }: { objectType: ObjectType }) {
  return (
    <Card className="om-card om-card--status">
      <Field label="Status">
        <Tag minimal intent={statusIntent(objectType.status)}>
          {objectType.status}
        </Tag>
      </Field>
      <Field label="Visibility">
        <Tag minimal intent={objectType.visibility === "prominent" ? "primary" : "none"} icon="eye-open">
          {objectType.visibility}
        </Tag>
      </Field>
      <Field label="Edits">
        <Tag minimal>{objectType.edits_enabled ? "Enabled" : "Disabled"}</Tag>
      </Field>
      <div className="om-card__rule" />
      <Field label="ID">
        <code className="om-mono">{objectType.id}</code>
      </Field>
    </Card>
  );
}

export default function TypeDetail({ bundle, types, onSelect, onSave, saveError, revision }: Props) {
  const { objectType, instanceCount } = bundle;

  return (
    <div className="om-detail">
      <header className="om-header">
        <Icon icon="cube" size={24} className="om-header__icon" intent="primary" />
        <div className="om-header__text">
          <H2 className="om-header__title">
            <EditableText
              key={`name-${objectType.id}-${revision}`}
              defaultValue={objectType.name}
              placeholder="Display name"
              selectAllOnFocus
              onConfirm={(value) => {
                if (value.trim() !== "" && value.trim() !== objectType.name) onSave({ name: value.trim() });
              }}
            />
          </H2>
          <div className="om-muted">
            Object type · {instanceCount.toLocaleString()} {instanceCount === 1 ? "object" : "objects"}
          </div>
        </div>
      </header>

      {saveError && (
        <Callout intent="danger" title="Could not save" className="om-alert">
          {saveError}
        </Callout>
      )}

      <div className="om-overview">
        <Card className="om-card">
          <Field label="Description">
            <EditableText
              key={`description-${objectType.id}-${revision}`}
              defaultValue={objectType.description ?? ""}
              placeholder="Add a description"
              multiline
              maxLines={4}
              onConfirm={(value) => {
                const next = value.trim() === "" ? null : value.trim();
                if (next !== objectType.description) onSave({ description: next });
              }}
            />
          </Field>
          <Field label="Point of contact">
            {objectType.point_of_contact ?? <span className="om-muted">None</span>}
          </Field>
          <Field label="Schema">
            <code className="om-mono">{objectType.schema}</code>
          </Field>
          <Field label="Datasource table">
            <code className="om-mono">{objectType.datasource_table}</code>
          </Field>
          <Field label="API name">
            <code className="om-mono">{objectType.api_name}</code>
          </Field>
        </Card>

        <StatusPanel objectType={objectType} />
      </div>

      <div className="om-columns">
        <PropertiesCard properties={bundle.properties} />
        <ActionTypesCard actions={bundle.actions} />
      </div>

      <LinkTypesCard links={bundle.links} types={types} onSelect={onSelect} />
    </div>
  );
}
