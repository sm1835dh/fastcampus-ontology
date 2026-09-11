import { Button, H2, Icon, Section, SectionCard, Tag, Tooltip } from "@blueprintjs/core";
import { useState } from "react";
import type { ActionType, InstanceDetail, InstanceRow, ResolvedLink, TypeBundle } from "../api.ts";
import ActionDialog from "./ActionDialog.tsx";
import { formatValue, idOf, titleOf } from "./valueFormat.tsx";

type Props = {
  bundle: TypeBundle;
  detail: InstanceDetail;
  /** Metadata for linked types, so their rows can be read by title. */
  bundles: Record<string, TypeBundle>;
  onOpenLink: (typeApiName: string, id: string) => void;
  /** Re-reads this object after an action has changed it. */
  onRefresh: () => Promise<void>;
};

function linkRows(link: ResolvedLink): InstanceRow[] {
  if (link.data === null) return [];
  return Array.isArray(link.data) ? link.data : [link.data];
}

export default function ObjectDetail({ bundle, detail, bundles, onOpenLink, onRefresh }: Props) {
  const links = Object.entries(detail.links);
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);

  return (
    <div className="om-detail">
      <header className="om-header">
        <Icon icon="cube" size={24} className="om-header__icon" intent="primary" />
        <div className="om-header__text">
          <H2 className="om-header__title">{titleOf(detail.data, bundle)}</H2>
          <div className="om-muted">{bundle.objectType.name}</div>
        </div>
      </header>

      {bundle.actions.length > 0 && (
        <div className="om-actionstrip">
          {bundle.actions.map((action) => (
            <Tooltip
              key={action.id}
              content={action.description ?? action.name}
              placement="bottom"
              compact
              disabled={!action.description}
            >
              <Button icon="play" text={action.name} onClick={() => setActiveAction(action)} />
            </Tooltip>
          ))}
        </div>
      )}

      <ActionDialog
        action={activeAction}
        bundle={bundle}
        instanceId={detail.id}
        before={detail.data}
        onClose={() => setActiveAction(null)}
        onCompleted={onRefresh}
      />

      <div className="om-columns om-columns--detail">
        <Section title="Properties">
          <SectionCard>
            {bundle.properties.map((property) => (
              <div className="om-field" key={property.id}>
                <div className="om-field__label">{property.name}</div>
                <div className="om-field__value">
                  {formatValue(detail.data[property.api_name], property.data_type)}
                </div>
              </div>
            ))}
          </SectionCard>
        </Section>

        <Section title="Links">
          <SectionCard>
            {links.length === 0 ? (
              <span className="om-muted">Nothing links to or from this object.</span>
            ) : (
              links.map(([apiName, link]) => {
                const rows = linkRows(link);
                const targetBundle = bundles[link.objectType];
                return (
                  <div className="om-linkgroup" key={apiName}>
                    <div className="om-linkgroup__head">
                      <Icon icon={link.direction === "outbound" ? "arrow-right" : "arrow-left"} size={12} />
                      <span className="om-linkgroup__name">{link.name}</span>
                      <Tag minimal round>
                        {rows.length}
                      </Tag>
                    </div>
                    <div className="om-chips">
                      {rows.length === 0 ? (
                        <span className="om-muted">None</span>
                      ) : (
                        rows.map((row, index) => {
                          const id = idOf(row, targetBundle);
                          return (
                            <Tag
                              key={id ?? index}
                              minimal
                              intent="primary"
                              interactive={id !== null}
                              onClick={() => id && onOpenLink(link.objectType, id)}
                            >
                              {titleOf(row, targetBundle)}
                            </Tag>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </SectionCard>
        </Section>
      </div>
    </div>
  );
}
