import { Tag } from "@blueprintjs/core";

/** Section heading with the count sitting next to it, as in the mock. */
export default function CountTitle({ title, count }: { title: string; count: number }) {
  return (
    <span className="om-section-title">
      {title}
      <Tag minimal round>
        {count}
      </Tag>
    </span>
  );
}
