import { Card, Icon } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";

type Props = {
  icon: IconName;
  value: number;
  label: string;
  note?: string;
};

export default function MetricCard({ icon, value, label, note }: Props) {
  return (
    <Card className="om-metric">
      <Icon icon={icon} size={20} className="om-metric__icon" intent="primary" />
      <div>
        <div className="om-metric__value">{value.toLocaleString()}</div>
        <div className="om-metric__label">{label}</div>
        {note && <div className="om-muted">{note}</div>}
      </div>
    </Card>
  );
}
