import { Menu, MenuItem, Tag } from "@blueprintjs/core";
import type { ObjectTypeListing } from "../api.ts";

type Props = {
  types: ObjectTypeListing[];
  selected: string | null;
  onSelect: (apiName: string) => void;
};

/** Left rail: every object type with its display name and instance count. */
export default function TypeRail({ types, selected, onSelect }: Props) {
  return (
    <nav className="om-rail">
      <div className="om-rail__header">
        <span className="om-rail__title">Object types</span>
        <Tag minimal round>
          {types.length}
        </Tag>
      </div>
      <Menu className="om-rail__menu">
        {types.map((type) => (
          <MenuItem
            key={type.api_name}
            icon="cube"
            text={type.name}
            active={type.api_name === selected}
            selected={type.api_name === selected}
            onClick={() => onSelect(type.api_name)}
            labelElement={
              <Tag minimal round>
                {type.instanceCount.toLocaleString()}
              </Tag>
            }
          />
        ))}
      </Menu>
    </nav>
  );
}
