export default function SettingsSection() {
  return (
    <div className="px-6 pt-5 pb-6">
      <div className="bg-surface border border-border rounded-card p-6">
        <h3 className="text-sm font-medium text-text-primary mb-2">Settings</h3>
        <p className="text-sm text-text-secondary">
          Scoring rules and clinic knowledge are managed directly in the database for now.
        </p>
        <p className="text-xs text-text-muted mt-2">
          Configuration UI is planned for a future release.
        </p>
      </div>
    </div>
  );
}
