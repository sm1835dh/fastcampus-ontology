import { Divider, Icon, Section, SectionCard, Tag } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import type { Property } from "../api.ts";
import CountTitle from "./CountTitle.tsx";

/** The datasource type each property reads, as an icon. */
function iconFor(dataType: string): IconName {
  switch (dataType) {
    case "integer":
    case "double":
      return "numerical";
    case "timestamp":
      return "calendar";
    case "boolean":
      return "segmented-control";
    case "string_array":
      return "array-string";
    case "json":
      return "code";
    default:
      return "citation";
  }
}

function PropertyRow({ property }: { property: Property }) {
  return (
    <li className="om-property">
      <Icon icon={iconFor(property.data_type)} className="om-property__icon" />
      <span className="om-property__name">{property.name}</span>
      {property.is_title && (
        <Tag minimal intent="success">
          Title
        </Tag>
      )}
      {property.is_primary_key && (
        <Tag minimal intent="primary">
          Primary key
        </Tag>
      )}
      <code className="om-property__api">{property.api_name}</code>
    </li>
  );
}

export default function PropertiesCard({ properties }: { properties: Property[] }) {
  // The identifying properties lead, the rest follow, as in the mock.
  const keyed = properties.filter((p) => p.is_title || p.is_primary_key);
  const rest = properties.filter((p) => !p.is_title && !p.is_primary_key);

  return (
    <Section title={<CountTitle title="Properties" count={properties.length} />}>
      <SectionCard padded={false}>
        <ul className="om-list">
          {keyed.map((property) => (
            <PropertyRow key={property.id} property={property} />
          ))}
        </ul>
        {keyed.length > 0 && rest.length > 0 && <Divider className="om-list__divider" />}
        <ul className="om-list">
          {rest.map((property) => (
            <PropertyRow key={property.id} property={property} />
          ))}
        </ul>
      </SectionCard>
    </Section>
  );
}
