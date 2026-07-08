import { AppSwitch } from '../../ui';
import { SETTINGS_SWITCH_CLASS, SETTINGS_SWITCH_THUMB_CLASS } from './constants';
import type { SelectionSettingsDraft } from './types';

interface SelectionTabProps {
  selectionDraft: SelectionSettingsDraft;
  setSelectionDraft: React.Dispatch<React.SetStateAction<SelectionSettingsDraft>>;
  isSaving: boolean;
}

export const SelectionTab = ({
  selectionDraft,
  setSelectionDraft,
  isSaving,
}: SelectionTabProps) => (
  <section className="space-y-4">
    <div>
      <h3 className="text-sm font-semibold text-text">Client photo selection</h3>
      <p className="text-xs text-muted">Configure favorites collection before sharing the link.</p>
    </div>

    <div className="space-y-3 rounded-2xl border border-border/50 bg-surface-1 px-4 py-4 dark:bg-surface-dark-1">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text">Enable selection</p>
          <p className="text-xs text-muted">Clients can start a favorites list.</p>
        </div>
        <AppSwitch
          checked={selectionDraft.is_enabled}
          onChange={(checked) => setSelectionDraft((prev) => ({ ...prev, is_enabled: checked }))}
          disabled={isSaving}
          aria-label="Enable client photo selection"
          className={SETTINGS_SWITCH_CLASS}
          thumbClassName={SETTINGS_SWITCH_THUMB_CLASS}
        />
      </div>

      <label className="block space-y-1.5 text-sm">
        <span className="font-semibold text-text">List title</span>
        <input
          value={selectionDraft.list_title}
          onChange={(event) =>
            setSelectionDraft((prev) => ({
              ...prev,
              list_title: event.target.value,
            }))
          }
          maxLength={127}
          className="w-full rounded-xl border border-border/50 bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
          disabled={isSaving}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/50 bg-surface px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text">Limit selections</p>
              <p className="text-xs text-muted">Set a maximum photo count.</p>
            </div>
            <AppSwitch
              checked={selectionDraft.limit_enabled}
              onChange={(checked) =>
                setSelectionDraft((prev) => ({ ...prev, limit_enabled: checked }))
              }
              disabled={isSaving}
              aria-label="Limit selection count"
              className={SETTINGS_SWITCH_CLASS}
              thumbClassName={SETTINGS_SWITCH_THUMB_CLASS}
            />
          </div>
          {selectionDraft.limit_enabled ? (
            <input
              type="number"
              min={1}
              value={selectionDraft.limit_value}
              onChange={(event) =>
                setSelectionDraft((prev) => ({
                  ...prev,
                  limit_value: event.target.value,
                }))
              }
              className="mt-3 w-28 rounded-lg border border-border/50 bg-surface-1 px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
              disabled={isSaving}
              aria-label="Selection limit"
            />
          ) : null}
        </div>

        <div className="rounded-xl border border-border/50 bg-surface px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text">Photo comments</p>
              <p className="text-xs text-muted">Allow notes on selected photos.</p>
            </div>
            <AppSwitch
              checked={selectionDraft.allow_photo_comments}
              onChange={(checked) =>
                setSelectionDraft((prev) => ({
                  ...prev,
                  allow_photo_comments: checked,
                }))
              }
              disabled={isSaving}
              aria-label="Allow photo comments"
              className={SETTINGS_SWITCH_CLASS}
              thumbClassName={SETTINGS_SWITCH_THUMB_CLASS}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ['require_email', 'Require email'],
          ['require_phone', 'Require phone'],
          ['require_client_note', 'Require note'],
        ].map(([key, text]) => (
          <div
            key={key}
            className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-surface px-3 py-2 text-sm text-text"
          >
            <span>{text}</span>
            <AppSwitch
              checked={Boolean(selectionDraft[key as keyof SelectionSettingsDraft])}
              onChange={(checked) => setSelectionDraft((prev) => ({ ...prev, [key]: checked }))}
              disabled={isSaving}
              aria-label={text}
              className={SETTINGS_SWITCH_CLASS}
              thumbClassName={SETTINGS_SWITCH_THUMB_CLASS}
            />
          </div>
        ))}
      </div>
    </div>
  </section>
);
