import { Callout, Spinner } from "@blueprintjs/core";
import { useCallback, useEffect, useState } from "react";
import { listObjectTypes, type ObjectType, type ObjectTypeListing } from "./api.ts";
import AppSidebar, { type AppId } from "./components/AppSidebar.tsx";
import BatchWorkspace from "./views/BatchWorkspace.tsx";
import ObjectExplorer from "./views/ObjectExplorer.tsx";
import OntologyManager from "./views/OntologyManager.tsx";
import ProposalsQueue from "./views/ProposalsQueue.tsx";

export default function App() {
  const [app, setApp] = useState<AppId>("ontology-manager");
  const [types, setTypes] = useState<ObjectTypeListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The type listing is the one thing both apps need, so it is loaded once.
  useEffect(() => {
    listObjectTypes()
      .then((listing) => setTypes(listing.data))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  const onTypeUpdated = useCallback((objectType: ObjectType) => {
    setTypes(
      (current) =>
        current?.map((type) => (type.api_name === objectType.api_name ? { ...type, ...objectType } : type)) ?? null,
    );
  }, []);

  return (
    <div className="om-shell">
      <AppSidebar current={app} onSelect={setApp} />
      {error ? (
        <Callout intent="danger" title="Could not reach the ontology API" className="om-alert om-alert--page">
          {error}
          <div className="om-muted">Is the ontology app running on port 3000?</div>
        </Callout>
      ) : !types ? (
        <Spinner className="om-spinner" />
      ) : app === "ontology-manager" ? (
        <OntologyManager types={types} onTypeUpdated={onTypeUpdated} />
      ) : app === "object-explorer" ? (
        <ObjectExplorer types={types} />
      ) : app === "proposals-queue" ? (
        <ProposalsQueue />
      ) : (
        <BatchWorkspace />
      )}
    </div>
  );
}
