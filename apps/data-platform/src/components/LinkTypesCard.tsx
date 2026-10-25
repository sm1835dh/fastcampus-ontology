import { Button, Icon, NonIdealState, Section, SectionCard, Tag } from "@blueprintjs/core";
import type { LinkView, ObjectTypeListing } from "../api.ts";
import CountTitle from "./CountTitle.tsx";

type Props = {
  links: { outbound: LinkView[]; inbound: LinkView[] };
  types: ObjectTypeListing[];
  onSelect: (apiName: string) => void;
};

/**
 * The mock draws links as an interactive graph. A list says the same things --
 * which type is on the other end, which way the link points, and which column
 * carries it -- and the type names double as navigation.
 */
function LinkRow({ link, displayName, onSelect }: { link: LinkView; displayName: string; onSelect: () => void }) {
  const outbound = link.direction === "outbound";
  return (
    <li className="om-link">
      <Icon
        icon={outbound ? "arrow-right" : "arrow-left"}
        className="om-link__direction"
        title={outbound ? "Outbound" : "Inbound"}
      />
      <span className="om-link__name">{link.name}</span>
      <Button className="om-link__target" minimal small icon="cube" text={displayName} onClick={onSelect} />
      <Tag minimal>{link.cardinality.replaceAll("_", " ")}</Tag>
      <code className="om-property__api">
        {link.apiName} · via {link.viaColumn}
      </code>
    </li>
  );
}

export default function LinkTypesCard({ links, types, onSelect }: Props) {
  const all = [...links.outbound, ...links.inbound];
  const displayName = (apiName: string) => types.find((t) => t.api_name === apiName)?.name ?? apiName;

  return (
    <Section title={<CountTitle title="Link types" count={all.length} />}>
      <SectionCard padded={false}>
        {all.length === 0 ? (
          <NonIdealState
            className="om-empty"
            icon="graph"
            title="No link types"
            description="Nothing links to or from this object type."
          />
        ) : (
          <>
            {links.outbound.length > 0 && (
              <>
                <div className="om-list__label">Outbound</div>
                <ul className="om-list">
                  {links.outbound.map((link) => (
                    <LinkRow
                      key={`out-${link.apiName}`}
                      link={link}
                      displayName={displayName(link.otherTypeApiName)}
                      onSelect={() => onSelect(link.otherTypeApiName)}
                    />
                  ))}
                </ul>
              </>
            )}
            {links.inbound.length > 0 && (
              <>
                <div className="om-list__label">Inbound</div>
                <ul className="om-list">
                  {links.inbound.map((link) => (
                    <LinkRow
                      key={`in-${link.apiName}`}
                      link={link}
                      displayName={displayName(link.otherTypeApiName)}
                      onSelect={() => onSelect(link.otherTypeApiName)}
                    />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </SectionCard>
    </Section>
  );
}
