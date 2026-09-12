import { Button, Tooltip } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";

export type AppId = "ontology-manager" | "object-explorer" | "batch-workspace";

const APPS: { id: AppId; label: string; icon: IconName }[] = [
  { id: "ontology-manager", label: "Ontology Manager", icon: "cube" },
  { id: "object-explorer", label: "Object Explorer", icon: "search-template" },
  { id: "batch-workspace", label: "Batch Investigation Workspace", icon: "lab-test" },
];

export default function AppSidebar({ current, onSelect }: { current: AppId; onSelect: (app: AppId) => void }) {
  return (
    <nav className="om-apps" aria-label="Applications">
      {APPS.map((app) => (
        <Tooltip key={app.id} content={app.label} placement="right" compact>
          <Button
            className="om-apps__button"
            large
            minimal
            icon={app.icon}
            active={current === app.id}
            aria-label={app.label}
            onClick={() => onSelect(app.id)}
          />
        </Tooltip>
      ))}
    </nav>
  );
}
