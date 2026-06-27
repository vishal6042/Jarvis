import { PERIODS, PERIOD_LABEL, type Period } from "@/lib/sample";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function PeriodTabs({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as Period)}>
      <TabsList>
        {PERIODS.map((p) => (
          <TabsTrigger key={p} value={p}>
            {PERIOD_LABEL[p]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
