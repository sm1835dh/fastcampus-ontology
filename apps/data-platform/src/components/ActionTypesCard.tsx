import { Icon, NonIdealState, Section, SectionCard } from "@blueprintjs/core";
import type { ActionType } from "../api.ts";
import CountTitle from "./CountTitle.tsx";

export default function ActionTypesCard({ actions }: { actions: ActionType[] }) {
  return (
    <Section title={<CountTitle title="Action types" count={actions.length} />}>
      <SectionCard padded={false}>
        {actions.length === 0 ? (
          <NonIdealState
            className="om-empty"
            icon="clean"
            title="No action types"
            description="This object type has no actions defined yet."
          />
        ) : (
          <ul className="om-list">
            {actions.map((action) => (
              <li key={action.id} className="om-action">
                <Icon icon="edit" className="om-action__icon" intent="primary" />
                <div className="om-action__body">
                  <span className="om-action__name">{action.name}</span>
                  {action.description && <span className="om-muted">{action.description}</span>}
                </div>
                <code className="om-property__api">{action.api_name}</code>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </Section>
  );
}
