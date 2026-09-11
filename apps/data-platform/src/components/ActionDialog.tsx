import {
  Button,
  Callout,
  Dialog,
  DialogBody,
  DialogFooter,
  FormGroup,
  HTMLSelect,
  InputGroup,
  NumericInput,
  Switch,
} from "@blueprintjs/core";
import { DateInput } from "@blueprintjs/datetime";
import { useEffect, useMemo, useState } from "react";
import {
  buildParams,
  fieldsFromSchema,
  formatDateInput,
  initialValues,
  missingRequired,
  parseDateInput,
  type ActionField,
  type FieldValue,
  type FormValues,
} from "../actionForm.ts";
import {
  ApiRequestError,
  invokeAction,
  type ActionType,
  type InstanceRow,
  type TypeBundle,
  type ValidationIssue,
} from "../api.ts";
import { formatValue } from "./valueFormat.tsx";

type Props = {
  /** The action being run; null keeps the dialog closed. */
  action: ActionType | null;
  bundle: TypeBundle;
  instanceId: string;
  /** The object as it stands, so the result can say what changed. */
  before: InstanceRow;
  onClose: () => void;
  onCompleted: () => Promise<void>;
};

type Outcome =
  | { kind: "editing" }
  | { kind: "submitting" }
  // `before` is captured at submit time: the prop moves once the view refreshes.
  | { kind: "succeeded"; before: InstanceRow; after: InstanceRow; refreshError: string | null }
  | { kind: "failed"; message: string; issues: ValidationIssue[] };

const inputId = (field: ActionField) => `action-param-${field.name}`;

function FieldEditor({
  field,
  value,
  disabled,
  onChange,
}: {
  field: ActionField;
  value: FieldValue;
  disabled: boolean;
  onChange: (next: FieldValue) => void;
}) {
  switch (field.kind) {
    case "datetime":
      return (
        <DateInput
          value={typeof value === "string" ? value : null}
          onChange={(next) => onChange(next)}
          formatDate={formatDateInput}
          parseDate={parseDateInput}
          placeholder="YYYY-MM-DD HH:mm"
          timePrecision="minute"
          closeOnSelection={false}
          showActionsBar
          fill
          disabled={disabled}
          inputProps={{ id: inputId(field) }}
        />
      );
    case "enum":
      return (
        <HTMLSelect
          id={inputId(field)}
          fill
          disabled={disabled}
          value={value === null ? "" : String(value)}
          onChange={(event) => onChange(event.currentTarget.value === "" ? null : event.currentTarget.value)}
          options={[
            { value: "", label: field.required ? "Select…" : "(none)" },
            ...field.enumValues.map((option) => ({ value: String(option), label: String(option) })),
          ]}
        />
      );
    case "number":
      return (
        <NumericInput
          id={inputId(field)}
          fill
          disabled={disabled}
          value={value === null ? "" : Number(value)}
          onValueChange={(asNumber, asText) => onChange(asText.trim() === "" || Number.isNaN(asNumber) ? null : asNumber)}
          minorStepSize={field.integer ? null : 0.1}
          allowNumericCharactersOnly
          {...(field.minimum !== undefined ? { min: field.minimum } : {})}
          {...(field.maximum !== undefined ? { max: field.maximum } : {})}
        />
      );
    case "boolean":
      return (
        <Switch
          id={inputId(field)}
          disabled={disabled}
          checked={value === true}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
      );
    default:
      return (
        <InputGroup
          id={inputId(field)}
          fill
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      );
  }
}

export default function ActionDialog({ action, bundle, instanceId, before, onClose, onCompleted }: Props) {
  const fields = useMemo(() => (action ? fieldsFromSchema(action.parameter_schema) : []), [action]);
  const [values, setValues] = useState<FormValues>({});
  const [outcome, setOutcome] = useState<Outcome>({ kind: "editing" });

  // Each opening starts from a clean form.
  useEffect(() => {
    setValues(initialValues(fields));
    setOutcome({ kind: "editing" });
  }, [fields]);

  const submitting = outcome.kind === "submitting";
  const missing = missingRequired(fields, values);

  const close = () => {
    if (!submitting) onClose();
  };

  const submit = async () => {
    if (!action) return;
    const snapshot = before;
    setOutcome({ kind: "submitting" });

    let after: InstanceRow;
    try {
      const result = await invokeAction(
        bundle.objectType.api_name,
        instanceId,
        action.api_name,
        buildParams(fields, values),
      );
      after = result.data;
    } catch (cause) {
      setOutcome(
        cause instanceof ApiRequestError
          ? { kind: "failed", message: cause.message, issues: cause.details }
          : { kind: "failed", message: cause instanceof Error ? cause.message : String(cause), issues: [] },
      );
      return;
    }

    // The action has landed. A refresh that fails afterwards is reported as
    // such, not as a failed action.
    let refreshError: string | null = null;
    try {
      await onCompleted();
    } catch (cause) {
      refreshError = cause instanceof Error ? cause.message : String(cause);
    }
    setOutcome({ kind: "succeeded", before: snapshot, after, refreshError });
  };

  const changes =
    outcome.kind === "succeeded"
      ? bundle.properties.filter(
          (property) =>
            JSON.stringify(outcome.before[property.api_name]) !== JSON.stringify(outcome.after[property.api_name]),
        )
      : [];

  return (
    <Dialog
      isOpen={action !== null}
      onClose={close}
      title={action?.name ?? ""}
      icon="play"
      className="om-dialog"
      canEscapeKeyClose={!submitting}
      canOutsideClickClose={!submitting}
    >
      <DialogBody>
        {action?.description && <p className="om-muted">{action.description}</p>}

        {outcome.kind === "succeeded" ? (
          <Callout intent="success" title={`${action?.name ?? "Action"} completed`} icon="tick-circle">
            {changes.length === 0 ? (
              "No properties changed."
            ) : (
              <ul className="om-result">
                {changes.map((property) => (
                  <li key={property.id}>
                    <span>{property.name}</span>
                    <span className="om-result__change">
                      {formatValue(outcome.before[property.api_name], property.data_type)}
                      <span className="om-muted">→</span>
                      <strong>{formatValue(outcome.after[property.api_name], property.data_type)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {outcome.refreshError && (
              <div className="om-muted">The view could not refresh: {outcome.refreshError}</div>
            )}
          </Callout>
        ) : (
          <>
            {fields.length === 0 && <p>This action takes no parameters.</p>}
            {fields.map((field) => (
              <FormGroup
                key={field.name}
                label={field.label}
                labelFor={inputId(field)}
                labelInfo={
                  field.required ? (
                    <span className="om-required" title="Required">
                      *
                    </span>
                  ) : undefined
                }
                helperText={field.description}
              >
                <FieldEditor
                  field={field}
                  value={values[field.name] ?? null}
                  disabled={submitting}
                  onChange={(next) => setValues((current) => ({ ...current, [field.name]: next }))}
                />
              </FormGroup>
            ))}

            {outcome.kind === "failed" && (
              <Callout intent="danger" title="The action did not run" icon="error">
                {outcome.message}
                {outcome.issues.length > 0 && (
                  <ul className="om-issues">
                    {outcome.issues.map((issue, index) => (
                      <li key={`${issue.location}-${issue.keyword}-${index}`}>
                        <code>{issue.location}</code> {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
              </Callout>
            )}
          </>
        )}
      </DialogBody>

      <DialogFooter
        actions={
          outcome.kind === "succeeded" ? (
            <Button intent="primary" text="Done" onClick={close} />
          ) : (
            <>
              <Button text="Cancel" onClick={close} disabled={submitting} />
              <Button
                intent="primary"
                text="Run"
                loading={submitting}
                disabled={missing.length > 0}
                onClick={() => void submit()}
              />
            </>
          )
        }
      />
    </Dialog>
  );
}
