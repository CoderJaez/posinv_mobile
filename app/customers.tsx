import { AppShell } from '@/components/layout/AppShell';
import { ModulePlaceholder } from '@/components/layout/ModulePlaceholder';

export default function CustomersScreen() {
  return (
    <AppShell title="Customers" subtitle="Optional local customer lookup route">
      <ModulePlaceholder
        icon="people-outline"
        title="Customer module placeholder"
        description="The prototype includes this sidebar item. It is scaffolded so later loyalty, contact lookup, or receivables workflows can be added without router changes."
        items={['Local-only customer records', 'Searchable tablet table', 'Audit log entries for changes']}
      />
    </AppShell>
  );
}
