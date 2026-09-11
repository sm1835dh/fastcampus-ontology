import { NonIdealState, Spinner } from "@blueprintjs/core";
import { useCallback, useEffect, useState } from "react";
import {
  getObjectType,
  patchObjectType,
  type ObjectType,
  type ObjectTypeListing,
  type TypeBundle,
} from "../api.ts";
import TypeDetail from "../components/TypeDetail.tsx";
import TypeRail from "../components/TypeRail.tsx";

type Props = {
  types: ObjectTypeListing[];
  /** The rail shows the display name, so an edit has to travel back up. */
  onTypeUpdated: (objectType: ObjectType) => void;
};

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

export default function OntologyManager({ types, onTypeUpdated }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [bundle, setBundle] = useState<TypeBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    setSelected((current) => current ?? types[0]?.api_name ?? null);
  }, [types]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setBundle(null);
    setSaveError(null);

    getObjectType(selected)
      .then((next) => !cancelled && setBundle(next))
      .catch((cause: unknown) => !cancelled && setError(message(cause)));

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const save = useCallback(
    async (patch: { name?: string; description?: string | null }) => {
      if (!selected) return;
      setSaveError(null);
      try {
        const { objectType } = await patchObjectType(selected, patch);
        setBundle((current) => (current ? { ...current, objectType } : current));
        onTypeUpdated(objectType);
      } catch (cause) {
        setSaveError(message(cause));
        // Put the editors back to what the server still holds.
        setRevision((value) => value + 1);
      }
    },
    [selected, onTypeUpdated],
  );

  return (
    <div className="om-layout">
      <TypeRail types={types} selected={selected} onSelect={setSelected} />
      <main className="om-main">
        {error ? (
          <NonIdealState icon="error" title="Could not load the object type" description={error} />
        ) : bundle ? (
          <TypeDetail
            bundle={bundle}
            types={types}
            onSelect={setSelected}
            onSave={(patch) => void save(patch)}
            saveError={saveError}
            revision={revision}
          />
        ) : selected ? (
          <Spinner className="om-spinner" />
        ) : (
          <NonIdealState icon="cube" title="No object types" />
        )}
      </main>
    </div>
  );
}
