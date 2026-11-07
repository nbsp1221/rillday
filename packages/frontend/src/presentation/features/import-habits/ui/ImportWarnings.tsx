import { Button } from '@repo/ui/components/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@repo/ui/components/collapsible';
import { ChevronDown } from 'lucide-react';
import type { HabitImportGroup } from '#application';
import { useI18n } from '#shared/i18n';

export function ImportWarnings({ groups }: { groups: HabitImportGroup[] }) {
  const { t } = useI18n();
  const warnings = [...new Set(groups.flatMap((group) => group.warnings))].filter(
    (warning) =>
      ![
        'history_rule_review',
        'historical_goals_unavailable',
        'source_identity_unavailable',
      ].includes(warning),
  );
  if (!warnings.length) {
    return null;
  }
  return (
    <Collapsible className="rounded-md border border-border">
      <CollapsibleTrigger
        render={<Button variant="ghost" />}
        className="h-auto min-h-9 w-full justify-between gap-2 rounded-md px-3 py-2 text-left text-sm"
      >
        {t('habitImport.limitations', { count: warnings.length })}
        <ChevronDown size={14} className="shrink-0" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="space-y-2 px-3 pb-3 text-xs text-muted-foreground">
          {warnings.map((warning) => (
            <li key={warning}>{t('habitImport.warning.' + warning)}</li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
